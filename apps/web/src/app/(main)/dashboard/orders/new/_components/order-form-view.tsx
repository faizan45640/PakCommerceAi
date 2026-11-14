"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { orderChannelValues, orderPaymentMethodValues } from "@pakcommerce/shared/orders";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api/api-client";
import { createDraftOrder } from "@/lib/api/orders";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { ORDER_CHANNEL_LABELS } from "../../_components/order-badges";
import {
  buildDraftInput,
  cartReducer,
  emptyOrderForm,
  estimateTotals,
  exceedsStock,
  type FormErrors,
  hasErrors,
  mapDetailsToErrors,
  type OrderFormValues,
  parseQuantity,
  QUANTITY_INVALID_MESSAGE,
  rupeesToMinor,
  validateDraftInput,
} from "./order-form";
import { ProductPicker } from "./product-picker";

const NO_ERRORS: FormErrors = { fields: {}, lines: {}, general: [] };

export function OrderFormView() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<OrderFormValues>(emptyOrderForm);
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Text being typed in a quantity box, keyed by variant id. Absent means "show the cart value".
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let ignore = false;
    fetchCurrentWorkspace()
      .then((workspace) => {
        if (!ignore) setWorkspaceId(workspace.id);
      })
      .catch((err: unknown) => {
        if (!ignore) setLoadError(err instanceof Error ? err.message : "Failed to load workspace.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  function set<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const shippingMinor = rupeesToMinor(values.shippingFee);
  const totals = estimateTotals(lines, shippingMinor ?? 0);
  const shortLines = lines.filter(exceedsStock);

  function editQuantity(variantId: string, text: string) {
    setQuantityDrafts((current) => ({ ...current, [variantId]: text }));
    const quantity = parseQuantity(text);
    if (quantity !== null) {
      dispatch({ type: "setQuantity", variantId, quantity });
      setErrors((current) => (hasErrors(current) ? { ...current, lines: {} } : current));
    }
  }

  function finishQuantity(variantId: string) {
    setQuantityDrafts((current) => {
      const rest = { ...current };
      delete rest[variantId];
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId || isSubmitting) return;

    const badQuantity = lines.findIndex((line) => {
      const draft = quantityDrafts[line.variantId];
      return draft !== undefined && parseQuantity(draft) === null;
    });
    if (badQuantity !== -1) {
      setErrors({ ...NO_ERRORS, lines: { [badQuantity]: QUANTITY_INVALID_MESSAGE } });
      return;
    }

    if (shippingMinor === null) {
      setErrors({ ...NO_ERRORS, fields: { shippingFee: "Enter a valid amount in rupees, e.g. 250 or 250.50." } });
      return;
    }

    const input = buildDraftInput(workspaceId, values, lines, shippingMinor);
    const clientErrors = validateDraftInput(input);
    if (hasErrors(clientErrors)) {
      setErrors(clientErrors);
      return;
    }

    setErrors(NO_ERRORS);
    setIsSubmitting(true);
    try {
      const order = await createDraftOrder(input);
      toast.success("Draft order created");
      router.push(`/dashboard/orders/${order.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.code === "validation_error") {
        const mapped = mapDetailsToErrors(err.details);
        if (!hasErrors(mapped)) mapped.general.push(err.message);
        setErrors(mapped);
      } else {
        setErrors({ ...NO_ERRORS, general: [err instanceof Error ? err.message : "Failed to create order."] });
      }
      setIsSubmitting(false);
    }
  }

  const back = (
    <Link
      href="/dashboard/orders"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to Orders
    </Link>
  );

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive text-sm">
          <AlertCircle className="size-4" />
          {loadError}
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-col gap-4 animate-pulse" aria-busy="true">
        <div className="h-6 w-36 rounded-md bg-muted" />
        <div className="h-64 rounded-xl border bg-muted/20" />
      </div>
    );
  }

  const textField = (key: "name" | "phone" | "city" | "email" | "addressLine", label: string, hint?: string) => {
    const error = errors.fields[`customer.${key}`];
    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`customer-${key}`}>{label}</FieldLabel>
        <Input
          id={`customer-${key}`}
          value={values[key]}
          onChange={(event) => set(key, event.target.value)}
          aria-invalid={error ? true : undefined}
        />
        {hint ? <FieldDescription>{hint}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {back}

      {errors.general.length > 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <ul className="flex flex-col gap-1">
            {errors.general.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              <CardDescription>Who the order is for.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {textField("name", "Name")}
              {textField("phone", "Phone")}
              {textField("city", "City")}
              {textField("email", "Email (optional)")}
              <div className="sm:col-span-2">
                {textField(
                  "addressLine",
                  "Address line",
                  "Required. A draft without an address can't be confirmed.",
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
              <CardDescription>Search active products, pick a variant, and add it to the order.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProductPicker workspaceId={workspaceId} onAdd={(line) => dispatch({ type: "add", line })} />

              {lines.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {lines.map((line, index) => {
                    const lineError = errors.lines[index];
                    return (
                      <li key={line.variantId} className="flex flex-col gap-1.5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-sm">{line.productTitle}</p>
                            <p className="text-muted-foreground text-xs">
                              {line.variantTitle}
                              {line.sku ? ` · SKU ${line.sku}` : ""} · {formatPkr(line.unitPriceMinor)} ·{" "}
                              {line.available === null ? "Stock not tracked" : `${line.available} available`}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Input
                              inputMode="numeric"
                              value={quantityDrafts[line.variantId] ?? String(line.quantity)}
                              onChange={(event) => editQuantity(line.variantId, event.target.value)}
                              onBlur={() => {
                                const draft = quantityDrafts[line.variantId];
                                if (draft === undefined || parseQuantity(draft) !== null) {
                                  finishQuantity(line.variantId);
                                } else {
                                  setErrors((current) => ({
                                    ...current,
                                    lines: { ...current.lines, [index]: QUANTITY_INVALID_MESSAGE },
                                  }));
                                }
                              }}
                              aria-invalid={quantityDrafts[line.variantId] !== undefined && parseQuantity(quantityDrafts[line.variantId]) === null ? true : undefined}
                              className="w-20"
                              aria-label={`Quantity for ${line.productTitle} ${line.variantTitle}`}
                            />
                            <span className="w-24 text-right font-medium text-sm">
                              {formatPkr(line.unitPriceMinor * line.quantity)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => dispatch({ type: "remove", variantId: line.variantId })}
                              aria-label={`Remove ${line.productTitle} ${line.variantTitle}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                        {exceedsStock(line) ? (
                          <p className="flex items-center gap-1.5 text-amber-700 text-xs dark:text-amber-300">
                            <AlertTriangle className="size-3.5" />
                            Only {line.available} available. You can save the draft, but it cannot be confirmed until
                            stock is enough.
                          </p>
                        ) : null}
                        {lineError ? <p className="text-destructive text-xs">{lineError}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No items yet. Add at least one product.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Order details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="order-channel">Channel</FieldLabel>
                <Select value={values.channel} onValueChange={(v) => set("channel", v as OrderFormValues["channel"])}>
                  <SelectTrigger id="order-channel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderChannelValues.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {ORDER_CHANNEL_LABELS[channel]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="order-payment">Payment method</FieldLabel>
                <Select
                  value={values.paymentMethod}
                  onValueChange={(v) => set("paymentMethod", v as OrderFormValues["paymentMethod"])}
                >
                  <SelectTrigger id="order-payment" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderPaymentMethodValues.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method === "cod" ? "Cash on delivery" : "Prepaid"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={errors.fields.shippingFee ? true : undefined}>
                <FieldLabel htmlFor="order-shipping">Shipping fee (Rs.)</FieldLabel>
                <Input
                  id="order-shipping"
                  inputMode="decimal"
                  placeholder="0"
                  value={values.shippingFee}
                  onChange={(event) => set("shippingFee", event.target.value)}
                  aria-invalid={errors.fields.shippingFee ? true : undefined}
                />
                {errors.fields.shippingFee ? <FieldError>{errors.fields.shippingFee}</FieldError> : null}
              </Field>
              <Field data-invalid={errors.fields.note ? true : undefined}>
                <FieldLabel htmlFor="order-note">Note</FieldLabel>
                <Textarea
                  id="order-note"
                  value={values.note}
                  onChange={(event) => set("note", event.target.value)}
                  aria-invalid={errors.fields.note ? true : undefined}
                />
                {errors.fields.note ? <FieldError>{errors.fields.note}</FieldError> : null}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Estimate. The server uses each variant&apos;s price when the order is saved.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatPkr(totals.subtotalMinor)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{formatPkr(totals.shippingMinor)}</dd>
                </div>
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <dt>Estimated total</dt>
                  <dd>{formatPkr(totals.totalMinor)}</dd>
                </div>
              </dl>
              {shortLines.length > 0 ? (
                <p className="text-amber-700 text-xs dark:text-amber-300">
                  {shortLines.length} line{shortLines.length === 1 ? "" : "s"} exceed available stock.
                </p>
              ) : null}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create draft order"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
