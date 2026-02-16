import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntityPill } from "./EntityPill";

describe("EntityPill", () => {
    it("renders the entity name", () => {
        render(<EntityPill entity={{ type: "user", id: 1, name: "John Smith" }} />);
        expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    it("does not show remove button when onRemove is undefined", () => {
        render(<EntityPill entity={{ type: "user", id: 1, name: "John Smith" }} />);
        expect(screen.queryByLabelText("Remove John Smith")).toBeNull();
    });

    it("calls onRemove when clicking the remove button", () => {
        const onRemove = vi.fn();
        render(
            <EntityPill
                entity={{ type: "user", id: 1, name: "John Smith" }}
                onRemove={onRemove}
            />
        );
        fireEvent.click(screen.getByLabelText("Remove John Smith"));
        expect(onRemove).toHaveBeenCalledTimes(1);
    });
});
