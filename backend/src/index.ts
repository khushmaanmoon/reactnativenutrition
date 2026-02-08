console.log("Backend running, we're in the clear");
import app from "./app";
import cors from 'cors';

const PORT = 4000;

app.listen(PORT, () => {
    console.log("Server running successfully.")
})