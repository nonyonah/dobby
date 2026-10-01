"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArchiveIcon, ArrowLeftIcon, DeleteIcon, EditIcon, PaletteIcon, PlusIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmojiPickerField } from "@/components/ui/emoji-picker";
import { ColorSelect } from "@/components/ui/color-select";
import { categoryHex } from "@/lib/transactions";
import { toast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";

const categoryOptions = ["Home", "Food & dining", "Transport", "Subscriptions", "Income", "Uncategorized"];
const categoryEmojis: Record<string, string> = { Home: "🏠", "Food & dining": "🍽", Transport: "🚕", Subscriptions: "🔁", Income: "↗️", Uncategorized: "📦" };
type Rule = { id: string | number; matcher: string; category: string; categoryId?: string | null; taxable: boolean };

export function CategoriesRulesPage() {
  const [categories, setCategories] = useState(categoryOptions);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("✨");
  /** null = let the API pick the next unused palette colour. */
  const [newCategoryColor, setNewCategoryColor] = useState<string | null>(null);
  const [categoryColors, setCategoryColors] = useState<Record<string, string | null>>({});
  const [recoloring, setRecoloring] = useState<string | null>(null);
  const [recolorDraft, setRecolorDraft] = useState<string | null>(null);

  const [rules, setRules] = useState<Rule[]>([
    { id: 1, matcher: "uber", category: "Transport", taxable: false },
    { id: 2, matcher: "stripe", category: "Income", taxable: true },
    { id: 3, matcher: "netflix", category: "Subscriptions", taxable: false },
  ]);
  const [matcher, setMatcher] = useState("");
  const [ruleCategory, setRuleCategory] = useState("Home");
  const [taxable, setTaxable] = useState(false);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void Promise.all([
      api.get<{ data: Array<{ id: string; name: string; color?: string | null; isArchived: boolean }> }>("/v1/categories"),
      api.get<{ data: Array<{ id: string; matcher: string; categoryId?: string | null; category?: { name: string } | null; isTaxable: boolean }> }>("/v1/rules"),
    ]).then(([categoryResponse, ruleResponse]) => {
      const activeCategories = categoryResponse.data.filter((category) => !category.isArchived);
      setCategories(activeCategories.map((category) => category.name));
      setCategoryIds(Object.fromEntries(activeCategories.map((category) => [category.name, category.id])));
      setCategoryColors(Object.fromEntries(activeCategories.map((category) => [category.name, category.color ?? null])));
      setRules(ruleResponse.data.map((rule) => ({ id: rule.id, matcher: rule.matcher, category: rule.category?.name ?? "Uncategorized", categoryId: rule.categoryId, taxable: rule.isTaxable })));
      if (activeCategories[0]) setRuleCategory(activeCategories[0].name);
    }).catch(() => {
      // Keep local seed data as a development fallback.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const addCategory = async () => {
    const value = newCategory.trim();
    if (!value || categories.includes(value)) return;
    try {
      const response = await api.post<{ data: { id: string; name: string; color?: string | null } }>(
        "/v1/categories",
        { name: value, isTaxable: false, ...(newCategoryColor ? { color: newCategoryColor } : {}) },
      );
      setCategories((current) => [...current, response.data.name]);
      setCategoryIds((current) => ({ ...current, [response.data.name]: response.data.id }));
      // The API assigns an unused colour when none was sent, so store what it
      // actually saved rather than what we asked for.
      setCategoryColors((current) => ({ ...current, [response.data.name]: response.data.color ?? null }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create this category.");
      return;
    }
    setNewCategory("");
    setNewCategoryEmoji("✨");
    setNewCategoryColor(null);
    toast.success("Category created");
  };

  const addRule = async () => {
    const value = matcher.trim();
    if (!value) return;
    try {
      const response = await api.post<{ data: { id: string; matcher: string; category?: { name: string } | null; categoryId?: string | null; isTaxable: boolean } }>("/v1/rules", { matcher: value, categoryId: categoryIds[ruleCategory] ?? null, isTaxable: taxable });
      setRules((current) => [...current, { id: response.data.id, matcher: response.data.matcher, category: response.data.category?.name ?? ruleCategory, categoryId: response.data.categoryId, taxable: response.data.isTaxable }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create this rule.");
      return;
    }
    setMatcher("");
    setTaxable(false);
    toast.success("Rule created");
  };

  const renameCategory = async (category: string) => {
    const value = window.prompt("Rename category", category)?.trim();
    if (!value || value === category || categories.includes(value)) return;
    const id = categoryIds[category];
    try {
      if (id) await api.patch(`/v1/categories/${id}`, { name: value });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename this category.");
      return;
    }
    setCategories((current) => current.map((item) => item === category ? value : item));
    setCategoryIds((current) => { const next = { ...current }; if (id) { delete next[category]; next[value] = id; } return next; });
    setRules((current) => current.map((rule) => rule.category === category ? { ...rule, category: value } : rule));
    toast.success("Category renamed");
  };

  const saveColor = async (category: string) => {
    const id = categoryIds[category];
    if (!id) return;
    const previous = categoryColors[category] ?? null;
    // Optimistic: the swatch should follow the click, and roll back on failure.
    setCategoryColors((current) => ({ ...current, [category]: recolorDraft }));
    try {
      await api.patch(`/v1/categories/${id}`, { color: recolorDraft });
    } catch (error) {
      setCategoryColors((current) => ({ ...current, [category]: previous }));
      toast.error(error instanceof Error ? error.message : "Could not change this category's colour.");
      return;
    }
    setRecoloring(null);
    toast.success("Colour updated");
  };

  return (
    <div className="w-full px-6 pt-6 pb-12">
      <div className="mx-auto max-w-[680px]">
      <div className="mb-6">
        <Link href="/settings" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-white"><HugeiconsIcon icon={ArrowLeftIcon} size={14}  /> Settings</Link>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">Categories &amp; rules</h1><p className="mt-1 text-[13px] text-muted-foreground">Control how imported transactions are organized and classified.</p></div></div>
      </div>

      <div className="grid max-w-4xl gap-5">
        <Card>
          <CardHeader><CardTitle>Custom categories</CardTitle><CardDescription className="font-medium">Create categories for your own reporting language. Archived categories stay on historical transactions.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); addCategory(); }}><label htmlFor="new-category" className="sr-only">New category name</label><EmojiPickerField value={newCategoryEmoji} onChange={setNewCategoryEmoji} label="Choose a category emoji" /><Input id="new-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Professional development" className="h-8 min-w-0 max-w-sm flex-1" /><Button type="submit" variant="primary" size="small"><HugeiconsIcon icon={PlusIcon}  /> Create category</Button></form>
            <ColorSelect value={newCategoryColor} onChange={(hex) => setNewCategoryColor(hex || null)} label="Colour" className="min-w-0 flex-1" />
            <div className="divide-y divide-line">
              {categories.map((category) => {
                const customEmoji = category.startsWith("✨ ") ? category.match(/^(\S+)\s(.+)$/) : null;
                const emoji = customEmoji?.[1] ?? categoryEmojis[category] ?? "✨";
                const displayName = customEmoji?.[2] ?? category;
                const isRecoloring = recoloring === category;
                const swatch = categoryHex(categoryIds[category] ?? category, categoryColors[category]);
                return <div key={category} className="py-2.5 first:pt-1"><div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-[13px] font-medium"><span className="flex size-7 shrink-0 items-center justify-center rounded-full text-[13px]" style={{ backgroundColor: swatch }} aria-hidden="true">{emoji}</span><span className="truncate">{displayName}</span></span><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Change colour of ${displayName}`} aria-expanded={isRecoloring} title={`Change colour of ${displayName}`} onClick={() => { if (isRecoloring) { setRecoloring(null); return; } setRecoloring(category); setRecolorDraft(categoryColors[category] ?? swatch); }}><HugeiconsIcon icon={PaletteIcon}  /></Button><Button variant="ghost" size="icon-sm" aria-label={`Rename ${displayName}`} title={`Rename ${displayName}`} onClick={() => renameCategory(category)}><HugeiconsIcon icon={EditIcon}  /></Button><Button variant="ghost" size="icon-sm" aria-label={`Archive ${displayName}`} title={`Archive ${displayName}`} onClick={async () => { const id = categoryIds[category]; try { if (id) await api.delete(`/v1/categories/${id}`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not archive this category."); return; } setCategories((current) => current.filter((item) => item !== category)); toast.success("Category archived"); }}><HugeiconsIcon icon={ArchiveIcon}  /></Button></div></div>{isRecoloring ? <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3 rounded-lg bg-muted px-3 py-2.5"><ColorSelect value={recolorDraft} onChange={setRecolorDraft} label={`${displayName} colour`} className="min-w-0 flex-1" /><div className="flex items-center gap-1.5"><Button variant="ghost" size="small" onClick={() => setRecoloring(null)}>Cancel</Button><Button variant="primary" size="small" onClick={() => void saveColor(category)}>Save colour</Button></div></div> : null}</div>;
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Persistent categorization rules</CardTitle><CardDescription>Rules run against the merchant or description and apply to future imports.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-3 rounded-lg bg-muted p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); addRule(); }}>
              <div className="space-y-1.5"><label htmlFor="matcher" className="text-[12px] font-medium text-muted-foreground">Contains</label><Input id="matcher" value={matcher} onChange={(event) => setMatcher(event.target.value)} placeholder="merchant or description" className="h-8 bg-white bg-muted" /></div>
              <div className="space-y-1.5"><label htmlFor="rule-category" className="text-[12px] font-medium text-muted-foreground">Category</label><NativeSelect id="rule-category" value={ruleCategory} onValueChange={(value) => setRuleCategory(value ?? "Home")} options={categories.map((category) => ({ value: category, label: category }))} /></div>
              <Button type="submit" variant="primary" size="small"><HugeiconsIcon icon={PlusIcon}  /> Add rule</Button>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground sm:col-span-2"><input type="checkbox" checked={taxable} onChange={(event) => setTaxable(event.target.checked)} className="size-3.5 accent-accent" /> Mark matching transactions as taxable</label>
            </form>

            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[12px]"><caption className="sr-only">Persistent categorization rules</caption><thead><tr className="border-b border-line text-muted-foreground"><th scope="col" className="pb-2 font-medium">Contains</th><th scope="col" className="pb-2 font-medium">Category</th><th scope="col" className="pb-2 font-medium">Tax status</th><th scope="col" className="pb-2 text-right font-medium">Action</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id} className="border-b border-line last:border-0"><td className="py-3 font-mono">{rule.matcher}</td><td className="py-3">{rule.category}</td><td className="py-3"><span className={`rounded-full px-2 py-1 text-[11px] ${rule.taxable ? "bg-accent-soft text-accent-600" : "bg-muted text-muted-foreground"}`}>{rule.taxable ? "Taxable" : "Non-tax"}</span></td><td className="py-3 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Delete rule containing ${rule.matcher}`} title="Delete rule" onClick={async () => { try { if (typeof rule.id === "string") await api.delete(`/v1/rules/${rule.id}`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete this rule."); return; } setRules((current) => current.filter((item) => item.id !== rule.id)); toast.success("Rule deleted"); }}><HugeiconsIcon icon={DeleteIcon}  /></Button></td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-[12px] text-muted-foreground">Re-apply rules to your existing transaction history after making changes.</p><Button variant="secondary" onClick={async () => { try { const response = await api.post<{ data: { updatedCount: number } }>("/v1/rules/reapply", {}); toast.success(`${response.data.updatedCount} transactions updated`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not re-apply rules."); } }}>Re-apply past transactions</Button></div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
