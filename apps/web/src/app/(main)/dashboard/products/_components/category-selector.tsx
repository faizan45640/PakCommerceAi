"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Category } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCategory, fetchCategories } from "@/lib/api/categories";

interface CategorySelectorProps {
  workspaceId: string;
  selectedCategoryIds: string[];
  onChange: (categoryIds: string[]) => void;
}

export function CategorySelector({
  workspaceId,
  selectedCategoryIds,
  onChange,
}: CategorySelectorProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick Inline Category Creator
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState<string>("none");
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Load categories on mount
  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setIsLoading(true);
        const data = await fetchCategories(workspaceId);
        if (!ignore) {
          setCategories(data);
        }
      } catch (err) {
        console.error("Failed to load categories:", err);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    if (workspaceId) {
      void load();
    }

    return () => {
      ignore = true;
    };
  }, [workspaceId]);

  // Group top-level and subcategories
  const { topLevelCategories, subcategoriesByParent } = useMemo(() => {
    const top: Category[] = [];
    const subs: Record<string, Category[]> = {};

    for (const cat of categories) {
      if (!cat.parentId) {
        top.push(cat);
      } else {
        (subs[cat.parentId] ??= []).push(cat);
      }
    }

    return { topLevelCategories: top, subcategoriesByParent: subs };
  }, [categories]);

  // Fast category lookup by ID
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  function handleSelectCategory(catId: string) {
    if (!catId || catId === "none") return;
    if (!selectedCategoryIds.includes(catId)) {
      if (selectedCategoryIds.length >= 10) {
        toast.warning("Maximum 10 categories can be assigned.");
        return;
      }
      onChange([...selectedCategoryIds, catId]);
    }
  }

  function handleRemoveCategory(id: string) {
    onChange(selectedCategoryIds.filter((item) => item !== id));
  }

  async function handleCreateCategory() {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Please enter a category name.");
      return;
    }

    setIsSavingCategory(true);
    try {
      const created = await createCategory(workspaceId, {
        name: trimmed,
        parentId: newParentId === "none" ? null : newParentId,
      });

      setCategories((prev) => [...prev, created]);

      // Auto-assign newly created category
      if (selectedCategoryIds.length < 10) {
        onChange([...selectedCategoryIds, created.id]);
      }

      toast.success(`Category "${created.name}" created and assigned!`);
      setNewName("");
      setNewParentId("none");
      setIsAddingNew(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create category.";
      toast.error(msg);
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleSeedStarterCategories() {
    setIsSavingCategory(true);
    try {
      const starterTree = [
        {
          name: "Apparel & Fashion",
          subs: ["Men's Kurtas", "Women's Lawn", "Stitched Suits"],
        },
        {
          name: "Footwear",
          subs: ["Peshawari Chappals", "Casual Shoes"],
        },
        {
          name: "Cosmetics & Skincare",
          subs: ["Fragrances & Attar", "Skincare"],
        },
        {
          name: "Electronics",
          subs: ["Mobile Accessories", "Earphones"],
        },
      ];

      const createdList: Category[] = [];

      for (const group of starterTree) {
        const parent = await createCategory(workspaceId, { name: group.name });
        createdList.push(parent);
        for (const sub of group.subs) {
          const child = await createCategory(workspaceId, {
            name: sub,
            parentId: parent.id,
          });
          createdList.push(child);
        }
      }

      setCategories((prev) => [...prev, ...createdList]);
      toast.success("Loaded Pakistani retail starter categories!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to seed categories.";
      toast.error(msg);
    } finally {
      setIsSavingCategory(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <Layers className="size-3.5 text-primary" />
          Category
        </Label>
        <button
          type="button"
          onClick={() => setIsAddingNew((prev) => !prev)}
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
        >
          <Plus className="size-3" />
          {isAddingNew ? "Cancel" : "New Category"}
        </button>
      </div>

      {/* Selected Category Chips */}
      {selectedCategoryIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedCategoryIds.map((id) => {
            const cat = categoryMap.get(id);
            if (!cat) return null;
            const parent = cat.parentId ? categoryMap.get(cat.parentId) : null;

            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 dark:bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 text-xs font-medium text-white shadow-2xs"
              >
                {parent ? (
                  <span className="text-zinc-400 font-normal">
                    {parent.name} &gt;
                  </span>
                ) : null}
                <span>{cat.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(id)}
                  className="ml-0.5 rounded-full hover:bg-zinc-700 p-0.5 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Clean Category Selector Dropdown */}
      <Select onValueChange={handleSelectCategory} value="">
        <SelectTrigger className="w-full text-xs h-9 bg-background">
          <SelectValue
            placeholder={
              isLoading
                ? "Loading categories..."
                : selectedCategoryIds.length > 0
                ? "+ Add another category..."
                : "Select a product category..."
            }
          />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {topLevelCategories.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No categories found. Click <strong>+ New Category</strong> above.
            </div>
          ) : (
            topLevelCategories.map((parent) => {
              const subs = subcategoriesByParent[parent.id] || [];
              return (
                <SelectGroup key={parent.id}>
                  <SelectLabel className="text-xs font-bold text-foreground">
                    {parent.name}
                  </SelectLabel>
                  <SelectItem value={parent.id} className="text-xs pl-4 font-medium">
                    {parent.name} (General)
                  </SelectItem>
                  {subs.map((sub) => (
                    <SelectItem
                      key={sub.id}
                      value={sub.id}
                      className="text-xs pl-7 text-muted-foreground"
                    >
                      ↳ {sub.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })
          )}
        </SelectContent>
      </Select>

      {/* Zero Categories Seed Helper */}
      {!isLoading && categories.length === 0 && !isAddingNew && (
        <button
          type="button"
          onClick={handleSeedStarterCategories}
          disabled={isSavingCategory}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors"
        >
          <Sparkles className="size-3 text-amber-500" />
          <span>New store? Click to load standard Pakistani retail categories</span>
        </button>
      )}

      {/* Clean Inline "+ New Category / Subcategory" Card */}
      <Collapsible open={isAddingNew} onOpenChange={setIsAddingNew}>
        <CollapsibleContent className="pt-2">
          <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <h4 className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <FolderPlus className="size-3.5 text-primary" />
                Add New Category
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div>
              <Label className="text-[11px] font-medium text-muted-foreground">Category Name</Label>
              <Input
                placeholder="e.g. Kurtas, Chappals, Watches"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateCategory();
                  }
                }}
                className="h-8 text-xs mt-1 bg-background"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-[11px] font-medium text-muted-foreground">
                Parent Category (Optional)
              </Label>
              <Select value={newParentId} onValueChange={setNewParentId}>
                <SelectTrigger className="h-8 text-xs mt-1 bg-background">
                  <SelectValue placeholder="None (Main Category)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Main Category)</SelectItem>
                  {topLevelCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddingNew(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateCategory()}
                size="sm"
                disabled={isSavingCategory || !newName.trim()}
                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isSavingCategory ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="size-3" />
                    Save & Select
                  </>
                )}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
