//Using this file to create and export the express server, not using it for running or listening here. 

import express from 'express';
import nutritionRoutes from "./routes/nutrition.routes"
import healthRoutes from "./routes/health.routes"
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

app.get("/health", (req, res) => {
    res.json({status : 'ok'})
});

app.use('/api', nutritionRoutes)
app.use("/health", healthRoutes);


export default app;