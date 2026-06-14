import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route Imports
import authRoutes from './routes/auth.routes.js';
import groupRoutes from './routes/group.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import balanceRoutes from './routes/balance.routes.js';
import settlementRoutes from './routes/settlement.routes.js';
import suggestionsRoutes from './routes/settlement-suggestions.routes.js';
import importRoutes from './routes/import.routes.js';
import personalTransactionRoutes from './routes/personal-transaction.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins dynamically (echoing back the requesting origin) to support credentials: true
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// API Base Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/settlement-suggestions', suggestionsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/personal-transactions', personalTransactionRoutes);
app.use('/public', express.static(path.join(__dirname, '../public')));

// Default root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the MoneyMap API!',
    status: 'Online',
    healthCheck: '/health'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start Server and Test DB connection
const startServer = async () => {
  try {
    // Attempt database verification
    console.log('Verifying connection to PostgreSQL database...');
    // We won't block server start on DB connection to allow compiling/running
    // and letting the user set up connection details after.
    prisma.$connect()
      .then(async () => {
        console.log('Successfully connected to Supabase PostgreSQL!');
        
        // Auto-repair missing adminId references on pre-existing groups
        try {
          const orphanedGroups = await prisma.group.findMany({
            where: { adminId: null },
            include: { memberships: { orderBy: { joinedAt: 'asc' }, take: 1 } }
          });

          if (orphanedGroups.length > 0) {
            console.log(`Database Healing: Found ${orphanedGroups.length} groups without admins. Repairing...`);
            for (const g of orphanedGroups) {
              if (g.memberships.length > 0) {
                await prisma.group.update({
                  where: { id: g.id },
                  data: { adminId: g.memberships[0].userId }
                });
              }
            }
            console.log('Database Healing: adminId repair complete.');
          }
        } catch (repairErr) {
          console.warn('Database Healing: Could not auto-repair admins:', repairErr.message);
        }
      })
      .catch((err) => {
        console.warn('Warning: Could not connect to PostgreSQL database. Please make sure DATABASE_URL is set in .env.');
        console.error(err.message);
      });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (!process.env.VERCEL) {
  startServer();
}

export default app;
