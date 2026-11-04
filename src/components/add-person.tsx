"use client";

import { Drawer } from "./drawer";
import { PersonForm } from "./person-form";

export function AddPerson({ onClose }: { onClose: () => void }) {
  return (
    <Drawer label="Add a person" title="Add a person" onClose={onClose}>
      <PersonForm onDone={onClose} onCancel={onClose} />
    </Drawer>
  );
}
