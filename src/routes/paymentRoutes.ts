import express from "express";
import {
  createPayment,
  updatePayment,
  deletePayment,
  getAllPayments,
} from "../controllers/paymentController";

const router = express.Router();

 router.post("/", createPayment);

 router.get("/", getAllPayments);

 router.put("/:id", updatePayment);

 router.delete("/:id", deletePayment);

 r
export default router;
