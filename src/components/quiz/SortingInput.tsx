import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QuizOption } from "@/types/quiz";

function Tile({ option, index, disabled }: { option: QuizOption; index: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      className={`flex touch-none select-none items-center gap-4 rounded-2xl border-2 bg-card p-5 text-xl font-bold ${isDragging ? "z-10 border-primary shadow-glow" : ""} ${disabled ? "opacity-70" : "cursor-grab"}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono">{index + 1}</span>
      <span className="flex-1">{option.text}</span>
      {!disabled && <span aria-hidden className="text-2xl text-muted-foreground">⠿</span>}
    </li>
  );
}

export function SortingInput({ options, saved, disabled, onSubmit }: { options: QuizOption[]; saved?: string[] | undefined; disabled: boolean; onSubmit: (order: string[]) => void }) {
  const [order, setOrder] = useState<string[]>(() => saved ?? options.map((o) => o.id));
  const shown = saved ?? order;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setOrder((o) => arrayMove(o, o.indexOf(String(e.active.id)), o.indexOf(String(e.over!.id))));
    navigator.vibrate?.(15);
  }
  const byId = new Map(options.map((o) => [o.id, o]));
  return (
    <div className="space-y-4">
      {!disabled && <p className="text-sm text-muted-foreground">Halte eine Kachel gedrückt und ziehe sie an die richtige Stelle.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {shown.map((id, i) => { const o = byId.get(id); return o ? <Tile key={id} option={o} index={i} disabled={disabled || !!saved} /> : null; })}
          </ul>
        </SortableContext>
      </DndContext>
      {!saved && <button disabled={disabled} onClick={() => onSubmit(order)} className="w-full rounded-xl bg-primary py-4 text-xl font-extrabold text-primary-foreground disabled:opacity-40">Reihenfolge einloggen</button>}
    </div>
  );
}
