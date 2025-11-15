import { Router } from "express";
import {
  createParty,
  getParties,
  getPartyById,
  updateParty,
  deleteParty,
} from "../controllers/partyController";

const router = Router();

router.post("/", createParty);
router.get("/", getParties);
router.get("/:id", getPartyById);
router.put("/:id", updateParty);
router.delete("/:id", deleteParty);

export default router;
