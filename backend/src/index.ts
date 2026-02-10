console.log("Backend running, we're in the clear");
import dotenv from 'dotenv';
dotenv.config()
import app from "./app";


console.log("Dotenv configured")

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log("Server running successfully.")
})