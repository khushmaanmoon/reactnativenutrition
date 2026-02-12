console.log("Backend running, we're in the clear");
import dotenv from 'dotenv';
dotenv.config()
import app from "./app";
import { ENV } from './config/env';


console.log("Dotenv configured")

const PORT = ENV.PORT;

app.listen(PORT, () => {
    console.log("Server running successfully.")
})
