import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "./config/supabase";
import authRouter from "./routes/auth";
import organizationsRouter from "./routes/organizations";
import rolesRouter from "./routes/roles";
import usersRouter from "./routes/users";
import projectsRouter from "./routes/projects";
import timesheetsRouter from "./routes/timesheets";
import approvalRouter from "./routes/approval";
import projectSetupRouter from "./routes/projectSetup";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("TimeIsMoney Backend Running 🚀");
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/users", usersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/timesheets", timesheetsRouter);
app.use("/api/approval", approvalRouter);
app.use("/api/project-setup", projectSetupRouter);

// Test Supabase connection
app.get("/test-db", async (_req, res) => {
  try {
    // Check if environment variables are set
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        success: false,
        message: "❌ Missing environment variables",
        missing: {
          SUPABASE_URL: !process.env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !process.env.SUPABASE_SERVICE_ROLE_KEY
        },
        details: "Make sure both variables are set in backend/.env"
      });
    }

    // Test connection by making a simple API call to Supabase
    const testUrl = `${process.env.SUPABASE_URL}/rest/v1/`;
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase API returned ${response.status}: ${response.statusText}`);
    }

    // Also test the Supabase client
    const { error: clientError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    
    if (clientError && !clientError.message.includes('JWT')) {
      // Some errors are expected, but connection errors should be caught
      console.log('Client test note:', clientError.message);
    }

    res.json({
      success: true,
      message: "✅ Database connection successful!",
      supabaseUrl: process.env.SUPABASE_URL,
      connectionStatus: "Connected",
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "❌ Database connection failed",
      error: error.message,
      details: "Check your .env file has correct SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      troubleshooting: [
        "1. Verify SUPABASE_URL in backend/.env (should start with https://)",
        "2. Verify SUPABASE_SERVICE_ROLE_KEY in backend/.env (should be the SECRET key)",
        "3. Make sure you're using the SECRET key (not publishable key) for backend",
        "4. Restart the server after changing .env: npm run dev"
      ]
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

