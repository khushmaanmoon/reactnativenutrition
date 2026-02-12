import { Router } from "express";
import { loginProvider, tokenProvider } from "./auth.controllers";


const router = Router();

//Registration payload will provide a new entry into the database for any user.

router.post("/register", tokenProvider);
router.post("/login", loginProvider);

export default router
