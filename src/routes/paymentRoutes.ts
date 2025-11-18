import express from "express";
import {
  createPayment,
  updatePayment,
  deletePayment,
  getAllPayments,
  getPaymentById,
} from "../controllers/paymentController";

const router = express.Router();

 router.post("/", createPayment);

 router.get("/", getAllPayments);

 router.put("/:id", updatePayment);

 router.delete("/:id", deletePayment);

 router.get("/:id", getPaymentById);

export default router;
