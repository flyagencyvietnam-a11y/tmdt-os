"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { OPERATORS_BY_KIND } from "./filter-engine";
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

interface Props<Row> {
  columns: GridColumn<Row>[];
  value: FilterGroup;
  onChange: (g: FilterGroup) => void;
  depth?: number;
}

export function FilterBuilder<Row>({
  columns,
  value,
  onChange,
  depth = 0,
}: Props<Row>) {
  const colByField = (f: string) => columns.find((c) => c.field === f);

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
        { field: first.field, operator: OPERATORS_BY_KIND[first.kind][0].value },
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
  onChange,
  onRemove,
}: {
  columns: GridColumn<Row>[];
  colByField: (f: string) => GridColumn<Row> | undefined;
  condition: FilterCondition;
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const col = colByField(condition.field) ?? columns[0];
  const ops = OPERATORS_BY_KIND[col.kind];
  const opMeta = ops.find((o) => o.value === condition.operator) ?? ops[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SimpleSelect
        triggerClassName="h-7 w-44"
        value={condition.field}
        onValueChange={(field) => {
          const nextCol = colByField(field);
          if (!nextCol) return;
          onChange({
            field,
            operator: OPERATORS_BY_KIND[nextCol.kind][0].value,
          });
        }}
        options={columns.map((c) => ({ value: c.field, label: c.header }))}
      />

      <SimpleSelect
        triggerClassName="h-7 w-40"
        value={condition.operator}
        onValueChange={(operator) =>
          onChange({ ...condition, operator: operator as FilterOperator })
        }
        options={ops.map((o) => ({ value: o.value, label: o.label }))}
      />

      {opMeta.args >= 1 &&
        (col.kind === "enum" && col.enumOptions ? (
          <SimpleSelect
            triggerClassName="h-7 w-40"
            placeholder="Chọn…"
            value={String(condition.value ?? "")}
            onValueChange={(v) => onChange({ ...condition, value: v })}
            options={col.enumOptions.map((o) => ({ value: o.value, label: o.label }))}
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
