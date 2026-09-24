import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getFrankfurterRates } from "../providers/frankfurter.js";

export const currencyRouter = Router();
currencyRouter.use(requireAuth);

currencyRouter.get("/rates", async (req, res) => {
  const input = z.object({ base: z.string().length(3).default("USD"), quotes: z.string().min(3).default("NGN") }).parse(req.query);
  const data = await getFrankfurterRates(input.base, input.quotes.split(","));
  res.json({ data });
});

currencyRouter.get("/convert", async (req, res) => {
  const input = z.object({ amount: z.coerce.number().finite(), from: z.string().length(3), to: z.string().length(3) }).parse(req.query);
  const rates = await getFrankfurterRates(input.from, [input.to]);
  const rate = input.from.toUpperCase() === input.to.toUpperCase() ? 1 : rates.rates[input.to.toUpperCase()];
  if (!rate) {
    res.status(422).json({ error: { code: "CURRENCY_RATE_UNAVAILABLE", message: "The requested currency conversion is unavailable." } });
    return;
  }
  res.json({ data: { amount: input.amount, from: input.from.toUpperCase(), to: input.to.toUpperCase(), rate, convertedAmount: input.amount * rate, date: rates.date } });
});
