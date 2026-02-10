import { Router } from "express";
import { tokenProvider } from "./auth.controllers";


const router = Router();

//Registration payload will provide a new entry into the database for any user.

router.post("/register", tokenProvider);

export default router