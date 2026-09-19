"use client";

import { useState } from "react";
import { Archive, ArrowLeft, Check, PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmojiPickerField } from "@/components/ui/emoji-picker";

const categoryOptions = ["Home", "Food & dining", "Transport", "Subscriptions", "Income", "Uncategorized"];
type Rule = { id: number; matcher: string; category: string; taxable: boolean };

export function CategoriesRulesPage() {
  const [categories, setCategories] = useState(categoryOptions);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("✨");

  const [rules, setRules] = useState<Rule[]>([
    { id: 1, matcher: "uber", category: "Transport", taxable: false },
    { id: 2, matcher: "stripe", category: "Income", taxable: true },
    { id: 3, matcher: "netflix", category: "Subscriptions", taxable: false },
  ]);
  const [matcher, setMatcher] = useState("");
  const [ruleCategory, setRuleCategory] = useState("Home");
  const [taxable, setTaxable] = useState(false);
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value || categories.includes(value)) return;
    setCategories((current) => [...current, `${newCategoryEmoji} ${value}`]);
    setNewCategory("");
    setNewCategoryEmoji("✨");
    showNotice("Category created");
  };

  const addRule = () => {
    const value = matcher.trim();
    if (!value) return;
    setRules((current) => [...current, { id: Date.now(), matcher: value, category: ruleCategory, taxable }]);
    setMatcher("");
    setTaxable(false);
    showNotice("Rule created");
  };

  const renameCategory = (category: string) => {
    const value = window.prompt("Rename category", category)?.trim();
    if (!value || value === category || categories.includes(value)) return;
    setCategories((current) => current.map((item) => item === category ? value : item));
    setRules((current) => current.map((rule) => rule.category === category ? { ...rule, category: value } : rule));
    showNotice("Category renamed");
  };

  return (
    <div className="w-full px-6 pt-6 pb-12">
      <div className="mb-6">
        <Link href="/settings" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-[#6b6d72] hover:text-[#1c1d20] dark:text-[#a2a3a8] dark:hover:text-white"><ArrowLeft size={14} /> Settings</Link>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1c1d20] dark:text-[#eceef0]">Categories &amp; rules</h1><p className="mt-1 text-[13px] text-[#6b6d72] dark:text-[#a2a3a8]">Control how imported transactions are organized and classified.</p></div>{notice ? <p role="status" className="flex items-center gap-1.5 text-[12px] text-[#35754e]"><Check size={14} /> {notice}</p> : null}</div>
      </div>

      <div className="grid max-w-4xl gap-5">
        <Card>
          <CardHeader><CardTitle>Custom categories</CardTitle><CardDescription>Create categories for your own reporting language. Archived categories stay on historical transactions.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); addCategory(); }}><label htmlFor="new-category" className="sr-only">New category name</label><EmojiPickerField value={newCategoryEmoji} onChange={setNewCategoryEmoji} label="Choose a category emoji" /><Input id="new-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Professional development" className="h-8 min-w-0 max-w-sm flex-1" /><Button type="submit" variant="primary" size="small"><Plus /> Create category</Button></form>
            <div className="divide-y divide-[#e9e7e2] dark:divide-[#2d2d31]">
              {categories.map((category) => <div key={category} className="flex items-center justify-between gap-3 py-2.5 first:pt-1"><span className="text-[13px] font-medium">{category}</span><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Rename ${category}`} title={`Rename ${category}`} onClick={() => renameCategory(category)}><PencilSimple /></Button><Button variant="ghost" size="icon-sm" aria-label={`Archive ${category}`} title={`Archive ${category}`} onClick={() => { setCategories((current) => current.filter((item) => item !== category)); showNotice("Category archived"); }}><Archive /></Button></div></div>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Persistent categorization rules</CardTitle><CardDescription>Rules run against the merchant or description and apply to future imports.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-3 rounded-lg bg-[#f9fafb] p-3 dark:bg-[#1f1f22] sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); addRule(); }}>
              <div className="space-y-1.5"><label htmlFor="matcher" className="text-[12px] font-medium text-[#6b6d72] dark:text-[#a2a3a8]">Contains</label><Input id="matcher" value={matcher} onChange={(event) => setMatcher(event.target.value)} placeholder="merchant or description" className="h-8 bg-white dark:bg-[#232327]" /></div>
              <div className="space-y-1.5"><label htmlFor="rule-category" className="text-[12px] font-medium text-[#6b6d72] dark:text-[#a2a3a8]">Category</label><Select value={ruleCategory} onValueChange={(value) => setRuleCategory(value ?? "Home")}><SelectTrigger id="rule-category" className="w-full bg-white dark:bg-[#232327]"><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
              <Button type="submit" variant="primary" size="small"><Plus /> Add rule</Button>
              <label className="flex items-center gap-2 text-[12px] text-[#6b6d72] dark:text-[#a2a3a8] sm:col-span-2"><input type="checkbox" checked={taxable} onChange={(event) => setTaxable(event.target.checked)} className="size-3.5 accent-[#4a55c9]" /> Mark matching transactions as taxable</label>
            </form>

            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[12px]"><caption className="sr-only">Persistent categorization rules</caption><thead><tr className="border-b border-[#e0ddd7] text-[#6b6d72] dark:border-[#2d2d31] dark:text-[#a2a3a8]"><th scope="col" className="pb-2 font-medium">Contains</th><th scope="col" className="pb-2 font-medium">Category</th><th scope="col" className="pb-2 font-medium">Tax status</th><th scope="col" className="pb-2 text-right font-medium">Action</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id} className="border-b border-[#e9e7e2] last:border-0 dark:border-[#2d2d31]"><td className="py-3 font-mono">{rule.matcher}</td><td className="py-3">{rule.category}</td><td className="py-3"><span className={`rounded-full px-2 py-1 text-[11px] ${rule.taxable ? "bg-[#eceefb] text-[#3a44a8]" : "bg-[#f1efeb] text-[#6b6d72] dark:bg-[#2d2d31] dark:text-[#a2a3a8]"}`}>{rule.taxable ? "Taxable" : "Non-tax"}</span></td><td className="py-3 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Delete rule containing ${rule.matcher}`} title="Delete rule" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}><Trash /></Button></td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e9e7e2] pt-4 dark:border-[#2d2d31]"><p className="text-[12px] text-[#6b6d72] dark:text-[#a2a3a8]">Re-apply rules to your existing transaction history after making changes.</p><Button variant="secondary" onClick={() => showNotice("Re-apply queued (mock)")}>Re-apply past transactions</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
