import { Router } from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  deleteInvoice,
  updateInvoice,
} from "../controllers/invoiceController";

const router = Router();

router.post("/", createInvoice);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);
router.delete("/:id", deleteInvoice);
router.put("/:id", updateInvoice);


export default router;
