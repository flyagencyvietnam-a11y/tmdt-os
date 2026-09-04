"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { OPERATORS_BY_KIND } from "./filter-engine";
import { TagDot, type TagColor } from "./tag";
import type {
  Conjunction,
  FilterCondition,
  FilterGroup,
  FilterOperator,
  GridColumn,
} from "./types";
import { isGroup } from "./types";

const EMPTY_GROUP: FilterGroup = { conjunction: "and", conditions: [] };

export function emptyFilterGroup(): FilterGroup {
  return structuredClone(EMPTY_GROUP);
}

/** Ngưỡng: cột có <= ngần này giá trị khác nhau thì coi là danh mục (hiện dropdown). */
const PICKLIST_MAX = 60;

type FilterOpt = { value: string; label: string; color?: TagColor };

/** Danh sách lựa chọn để lọc 1 cột (value khớp accessor). null = không phải danh mục. */
function optionsFor<Row>(
  col: GridColumn<Row>,
  distinct?: (field: string) => string[],
): FilterOpt[] | null {
  const color = (v: string) => col.enumColors?.[v];
  if (col.filterOptions?.length)
    return col.filterOptions.map((o) => ({ ...o, color: color(o.value) }));
  if (col.enumOptions?.length) {
    return col.enumOptions.map((o) => ({
      value: o.value,
      label: col.enumLabels?.[o.value] ?? o.label,
      color: color(o.value),
    }));
  }
  if ((col.kind === "enum" || col.kind === "text") && distinct) {
    const vals = distinct(col.field);
    if (vals.length > 0 && vals.length <= PICKLIST_MAX)
      return vals.map((v) => ({ value: v, label: v, color: color(v) }));
  }
  return null;
}

/** Nhãn kèm chấm màu cho <SimpleSelect>. */
function optLabel(o: FilterOpt): React.ReactNode {
  if (!o.color) return o.label;
  return (
    <span className="inline-flex items-center gap-1.5">
      <TagDot color={o.color} />
      {o.label}
    </span>
  );
}

function opsFor<Row>(
  col: GridColumn<Row>,
  isPicklist: boolean,
): { value: FilterOperator; label: string; args: 0 | 1 | 2 }[] {
  return isPicklist ? OPERATORS_BY_KIND.enum : OPERATORS_BY_KIND[col.kind];
}

interface Props<Row> {
  columns: GridColumn<Row>[];
  value: FilterGroup;
  onChange: (g: FilterGroup) => void;
  distinct?: (field: string) => string[];
  depth?: number;
}

export function FilterBuilder<Row>({
  columns,
  value,
  onChange,
  distinct,
  depth = 0,
}: Props<Row>) {
  const colByField = (f: string) => columns.find((c) => c.field === f);

  function defaultOp(col: GridColumn<Row>): FilterOperator {
    return opsFor(col, !!optionsFor(col, distinct))[0].value;
  }

  function update(idx: number, next: FilterCondition | FilterGroup) {
    const conditions = value.conditions.slice();
    conditions[idx] = next;
    onChange({ ...value, conditions });
  }
  function remove(idx: number) {
    onChange({
      ...value,
      conditions: value.conditions.filter((_, i) => i !== idx),
    });
  }
  function addCondition() {
    const first = columns[0];
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        { field: first.field, operator: defaultOp(first) },
      ],
    });
  }
  function addGroup() {
    onChange({
      ...value,
      conditions: [...value.conditions, emptyFilterGroup()],
    });
  }

  return (
    <div
      className={
        depth > 0
          ? "rounded-md border border-dashed p-2 space-y-2 bg-muted/30"
          : "space-y-2"
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Khớp</span>
        <SimpleSelect
          triggerClassName="h-7 w-24"
          value={value.conjunction}
          onValueChange={(v) =>
            onChange({ ...value, conjunction: (v || "and") as Conjunction })
          }
          options={[
            { value: "and", label: "TẤT CẢ" },
            { value: "or", label: "BẤT KỲ" },
          ]}
        />
        <span className="text-muted-foreground">điều kiện dưới đây</span>
      </div>

      {value.conditions.map((c, idx) =>
        isGroup(c) ? (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1">
              <FilterBuilder
                columns={columns}
                value={c}
                onChange={(g) => update(idx, g)}
                distinct={distinct}
                depth={depth + 1}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => remove(idx)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <ConditionRow
            key={idx}
            columns={columns}
            colByField={colByField}
            condition={c}
            distinct={distinct}
            defaultOp={defaultOp}
            onChange={(next) => update(idx, next)}
            onRemove={() => remove(idx)}
          />
        ),
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7" onClick={addCondition}>
          <Plus className="mr-1 h-3 w-3" /> Điều kiện
        </Button>
        {depth < 2 && (
          <Button variant="outline" size="sm" className="h-7" onClick={addGroup}>
            <Plus className="mr-1 h-3 w-3" /> Nhóm điều kiện
          </Button>
        )}
      </div>
    </div>
  );
}

function ConditionRow<Row>({
  columns,
  colByField,
  condition,
  distinct,
  defaultOp,
  onChange,
  onRemove,
}: {
  columns: GridColumn<Row>[];
  colByField: (f: string) => GridColumn<Row> | undefined;
  condition: FilterCondition;
  distinct?: (field: string) => string[];
  defaultOp: (col: GridColumn<Row>) => FilterOperator;
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const col = colByField(condition.field) ?? columns[0];
  const opts = optionsFor(col, distinct);
  const isPicklist = !!opts;
  const ops = opsFor(col, isPicklist);
  const opMeta = ops.find((o) => o.value === condition.operator) ?? ops[0];
  const isMulti =
    condition.operator === "any_of" || condition.operator === "none_of";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SimpleSelect
        triggerClassName="h-7 w-44"
        value={condition.field}
        onValueChange={(field) => {
          const nextCol = colByField(field);
          if (!nextCol) return;
          onChange({ field, operator: defaultOp(nextCol) });
        }}
        options={columns.map((c) => ({ value: c.field, label: c.header }))}
      />

      <SimpleSelect
        triggerClassName="h-7 w-40"
        value={condition.operator}
        onValueChange={(operator) =>
          onChange({
            ...condition,
            operator: operator as FilterOperator,
            // đổi giữa 1 giá trị <-> nhiều giá trị thì reset value cho đúng kiểu
            value:
              (operator === "any_of" || operator === "none_of") !== isMulti
                ? undefined
                : condition.value,
          })
        }
        options={ops.map((o) => ({ value: o.value, label: o.label }))}
      />

      {opMeta.args >= 1 &&
        (isMulti ? (
          <MultiPick
            options={opts ?? []}
            value={Array.isArray(condition.value) ? (condition.value as string[]) : []}
            onChange={(v) => onChange({ ...condition, value: v })}
          />
        ) : opts ? (
          <SimpleSelect
            triggerClassName="h-7 w-44"
            placeholder="Chọn…"
            value={String(condition.value ?? "")}
            onValueChange={(v) => onChange({ ...condition, value: v })}
            options={opts.map((o) => ({ value: o.value, label: optLabel(o) }))}
          />
        ) : (
          <Input
            className="h-7 w-36"
            type={
              col.kind === "number" || col.kind === "money"
                ? "number"
                : col.kind === "date"
                  ? "date"
                  : "text"
            }
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          />
        ))}

      {opMeta.args >= 2 && (
        <Input
          className="h-7 w-36"
          type={col.kind === "date" ? "date" : "number"}
          value={String(condition.value2 ?? "")}
          onChange={(e) => onChange({ ...condition, value2: e.target.value })}
        />
      )}

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Chọn nhiều giá trị (cho toán tử "là một trong" / "không là một trong"). */
function MultiPick({
  options,
  value,
  onChange,
}: {
  options: FilterOpt[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const set = new Set(value);
  const toggle = (v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    onChange([...n]);
  };
  const label =
    value.length === 0
      ? "Chọn…"
      : value.length <= 2
        ? value
            .map((v) => options.find((o) => o.value === v)?.label ?? v)
            .join(", ")
        : `${value.length} giá trị`;

  if (options.length === 0)
    return (
      <Input
        className="h-7 w-44"
        placeholder="a, b, c"
        value={value.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    );

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-7 w-44 justify-start truncate font-normal",
        )}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-56 overflow-y-auto">
        <div className="space-y-1">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={set.has(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              {o.color && <TagDot color={o.color} />}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
