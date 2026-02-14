import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { EntityPill } from "./EntityPill";
import { ThemeProvider } from 'styled-components';
import { theme } from '../../styles';

const renderWithTheme = (ui: React.ReactElement) =>
    render(
        <ThemeProvider theme={theme}>
            <Theme>{ui}</Theme>
        </ThemeProvider>
    );

describe("EntityPill", () => {
    it("renders the entity name", () => {
        renderWithTheme(
            <Theme>
                <EntityPill entity={{ type: "user", id: 1, name: "John Smith" }} />
            </Theme>
        );
        expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    it("does not show remove button when onRemove is undefined", () => {
        renderWithTheme(
            <Theme>
                <EntityPill entity={{ type: "user", id: 1, name: "John Smith" }} />
            </Theme>
        );
        expect(screen.queryByLabelText("Remove John Smith")).toBeNull();
    });

    it("calls onRemove when clicking the remove button", () => {
        const onRemove = vi.fn();
        renderWithTheme(
            <Theme>
                <EntityPill entity={{ type: "user", id: 1, name: "John Smith" }} onRemove={onRemove} />
            </Theme>
        );
        fireEvent.click(screen.getByLabelText("Remove John Smith"));
        expect(onRemove).toHaveBeenCalledTimes(1);
    });
});
