import { Router } from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  deleteInvoice,
} from "../controllers/invoiceController";

const router = Router();

router.post("/", createInvoice);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);
router.delete("/:id", deleteInvoice);

export default router;
