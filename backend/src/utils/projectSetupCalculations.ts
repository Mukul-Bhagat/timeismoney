/**
 * Project Setup Calculation Utilities
 * 
 * This module provides calculation functions for the project cost planning system:
 * - Week calculations from project dates
 * - Allocation totals (hours and costs)
 * - Project totals aggregation
 * - Margin calculations and status determination
 */

import { supabase } from '../config/supabase';

/**
 * Calculate total weeks between start and end dates
 * Rounds up to ensure partial weeks are included
 */
export function calculateWeeks(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Add 1 to include both start and end date
  return Math.ceil((diffDays + 1) / 7);
}

/**
 * Calculate totals for a single allocation (sum of weekly hours)
 * Returns total hours and total amount (hours * rate)
 */
export async function calculateAllocationTotals(
  allocationId: string
): Promise<{ totalHours: number; totalAmount: number } | null> {
  try {
    // Get the allocation to get hourly rate
    const { data: allocation, error: allocError } = await supabase
      .from('project_role_allocations')
      .select('hourly_rate')
      .eq('id', allocationId)
      .single();

    if (allocError || !allocation) {
      console.error('Error fetching allocation:', allocError);
      return null;
    }

    // Get all weekly hours for this allocation
    const { data: weeklyHours, error: hoursError } = await supabase
      .from('project_weekly_hours')
      .select('hours')
      .eq('allocation_id', allocationId);

    if (hoursError) {
      console.error('Error fetching weekly hours:', hoursError);
      return null;
    }

    // Sum up all hours
    const totalHours = (weeklyHours || []).reduce((sum, week) => sum + Number(week.hours), 0);
    const totalAmount = totalHours * Number(allocation.hourly_rate);

    return {
      totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimals
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  } catch (error) {
    console.error('Error calculating allocation totals:', error);
    return null;
  }
}

/**
 * Update allocation totals in the database
 * Recalculates and saves total_hours and total_amount
 */
export async function updateAllocationTotals(allocationId: string): Promise<boolean> {
  const totals = await calculateAllocationTotals(allocationId);
  
  if (!totals) {
    return false;
  }

  const { error } = await supabase
    .from('project_role_allocations')
    .update({
      total_hours: totals.totalHours,
      total_amount: totals.totalAmount,
    })
    .eq('id', allocationId);

  if (error) {
    console.error('Error updating allocation totals:', error);
    return false;
  }

  return true;
}

/**
 * Calculate project-wide totals (sum of all allocations)
 * Returns total hours and total internal cost
 */
export async function calculateProjectTotals(
  projectId: string
): Promise<{ totalHours: number; totalCost: number } | null> {
  try {
    // Get all allocations for this project
    const { data: allocations, error } = await supabase
      .from('project_role_allocations')
      .select('total_hours, total_amount')
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching allocations:', error);
      return null;
    }

    // Sum up all allocation totals
    const totalHours = (allocations || []).reduce((sum, alloc) => sum + Number(alloc.total_hours), 0);
    const totalCost = (allocations || []).reduce((sum, alloc) => sum + Number(alloc.total_amount), 0);

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  } catch (error) {
    console.error('Error calculating project totals:', error);
    return null;
  }
}

/**
 * Calculate margin percentages and determine status
 * 
 * @param internalCost - Total internal cost (sum of all allocation amounts)
 * @param customerAmount - Total customer amount (total hours * customer rate)
 * @param soldCostPercentage - Sold cost percentage (default 11%)
 * 
 * @returns Margin calculations and status
 */
export function calculateMargins(
  internalCost: number,
  customerAmount: number,
  soldCostPercentage: number = 11
): {
  grossMargin: number;
  currentMargin: number;
  marginStatus: 'green' | 'yellow' | 'red';
} {
  // Avoid division by zero
  if (customerAmount === 0) {
    return {
      grossMargin: 0,
      currentMargin: 0,
      marginStatus: 'red',
    };
  }

  // Gross Margin % = ((Customer Amount - Internal Cost) / Customer Amount) * 100
  const grossMargin = ((customerAmount - internalCost) / customerAmount) * 100;
  
  // Current Margin = Gross Margin - Sold Cost %
  const currentMargin = grossMargin - soldCostPercentage;

  // Determine status based on current margin
  let marginStatus: 'green' | 'yellow' | 'red';
  if (currentMargin <= 5) {
    marginStatus = 'red'; // Critical - Project at Risk
  } else if (currentMargin >= 6 && currentMargin <= 19) {
    marginStatus = 'yellow'; // Warning - Review Pricing
  } else {
    marginStatus = 'green'; // Healthy
  }

  return {
    grossMargin: Math.round(grossMargin * 100) / 100,
    currentMargin: Math.round(currentMargin * 100) / 100,
    marginStatus,
  };
}

/**
 * Update project setup totals in the database
 * Recalculates internal totals, customer amount, and margins
 */
export async function updateProjectSetupTotals(projectId: string): Promise<boolean> {
  try {
    // Get current project setup
    const { data: setup, error: setupError } = await supabase
      .from('project_setups')
      .select('customer_rate_per_hour, sold_cost_percentage')
      .eq('project_id', projectId)
      .single();

    if (setupError || !setup) {
      console.error('Error fetching project setup:', setupError);
      return false;
    }

    // Calculate project totals
    const totals = await calculateProjectTotals(projectId);
    if (!totals) {
      return false;
    }

    // Calculate customer amount
    const customerAmount = totals.totalHours * Number(setup.customer_rate_per_hour);

    // Calculate margins
    const margins = calculateMargins(
      totals.totalCost,
      customerAmount,
      Number(setup.sold_cost_percentage)
    );

    // Update project setup
    const { error: updateError } = await supabase
      .from('project_setups')
      .update({
        total_internal_hours: totals.totalHours,
        total_internal_cost: totals.totalCost,
        total_customer_amount: Math.round(customerAmount * 100) / 100,
        gross_margin_percentage: margins.grossMargin,
        current_margin_percentage: margins.currentMargin,
        margin_status: margins.marginStatus,
      })
      .eq('project_id', projectId);

    if (updateError) {
      console.error('Error updating project setup:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating project setup totals:', error);
    return false;
  }
}

/**
 * Validate that all allocations have required data
 * Used before finalizing a project setup
 */
export async function validateProjectSetup(projectId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Check if project setup exists
    const { data: setup, error: setupError } = await supabase
      .from('project_setups')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (setupError || !setup) {
      errors.push('Project setup not found');
      return { valid: false, errors };
    }

    // Check if there are any allocations
    const { data: allocations, error: allocError } = await supabase
      .from('project_role_allocations')
      .select('id, user_id, role_id, hourly_rate')
      .eq('project_id', projectId);

    if (allocError) {
      errors.push('Error fetching allocations');
      return { valid: false, errors };
    }

    if (!allocations || allocations.length === 0) {
      errors.push('At least one role allocation is required');
      return { valid: false, errors };
    }

    // Validate each allocation
    for (const alloc of allocations) {
      if (!alloc.user_id) {
        errors.push('All allocations must have a user assigned');
      }
      if (!alloc.role_id) {
        errors.push('All allocations must have a role assigned');
      }
      if (!alloc.hourly_rate || Number(alloc.hourly_rate) <= 0) {
        errors.push('All allocations must have a valid hourly rate');
      }
    }

    // Check customer rate
    if (!setup.customer_rate_per_hour || Number(setup.customer_rate_per_hour) <= 0) {
      errors.push('Customer rate per hour must be set');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    console.error('Error validating project setup:', error);
    return {
      valid: false,
      errors: ['Validation error occurred'],
    };
  }
}

/**
 * Get default hourly rate for a user-role combination
 * Priority: 1. User-specific rate (users.rate_per_hour)
 *          2. Role default rate (roles.default_rate_per_hour)
 *          3. User-hourly-rates table (existing)
 * Returns null if no rate is configured
 */
export async function getDefaultHourlyRate(
  userId: string,
  roleId: string,
  organizationId: string
): Promise<number | null> {
  try {
    // Priority 1: Check user-specific rate
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('rate_per_hour')
      .eq('id', userId)
      .single();

    if (!userError && user && user.rate_per_hour !== null && user.rate_per_hour !== undefined) {
      return Number(user.rate_per_hour);
    }

    // Priority 2: Check role default rate
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('default_rate_per_hour')
      .eq('id', roleId)
      .single();

    if (!roleError && role && role.default_rate_per_hour !== null && role.default_rate_per_hour !== undefined) {
      return Number(role.default_rate_per_hour);
    }

    // Priority 3: Check user_hourly_rates table (existing logic)
    const { data, error } = await supabase
      .from('user_hourly_rates')
      .select('hourly_rate')
      .eq('user_id', userId)
      .eq('role_id', roleId)
      .eq('organization_id', organizationId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return Number(data.hourly_rate);
  } catch (error) {
    console.error('Error fetching default hourly rate:', error);
    return null;
  }
}

/**
 * Generate array of week numbers for a project
 * Used for UI rendering and validation
 */
export function generateWeekNumbers(totalWeeks: number): number[] {
  return Array.from({ length: totalWeeks }, (_, i) => i + 1);
}

/**
 * Calculate week start and end dates for display
 */
export function getWeekDateRange(
  projectStartDate: Date | string,
  weekNumber: number
): { startDate: Date; endDate: Date } {
  const start = typeof projectStartDate === 'string' ? new Date(projectStartDate) : projectStartDate;
  
  // Calculate days offset for this week (0-indexed)
  const daysOffset = (weekNumber - 1) * 7;
  
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + daysOffset);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return {
    startDate: weekStart,
    endDate: weekEnd,
  };
}

