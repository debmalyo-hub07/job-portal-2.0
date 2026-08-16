import type { ImgHTMLAttributes, PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
}));

import CompanyAvatar from "@/components/shared/CompanyAvatar";

describe("CompanyAvatar", () => {
  it("shows a branded initials fallback when a company has no logo", () => {
    render(<CompanyAvatar name="Northstar Labs" />);

    expect(screen.getByText("NL")).toBeInTheDocument();
    expect(document.querySelector("[data-company-avatar]")).toHaveClass("rounded-sharp");
  });

  it("keeps a supplied logo contained and accessible when it is a meaningful image", () => {
    render(
      <CompanyAvatar
        name="Northstar Labs"
        logoUrl="https://res.cloudinary.com/demo/image/upload/logo.png"
        alt="Northstar Labs logo"
      />,
    );

    expect(screen.getByAltText("Northstar Labs logo")).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/image/upload/logo.png",
    );
  });
});
