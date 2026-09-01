import { describe, expect, it } from "vitest";

import {
  emailDomainOf,
  isFreeMailAddress,
  signupDomainMatches,
  websiteHostOf,
} from "../src/signupSignals.js";

describe("emailDomainOf", () => {
  it("extracts the domain, lowercased", () => {
    expect(emailDomainOf("Mira@NorthStarLabs.Example")).toBe("northstarlabs.example");
  });

  it("answers an empty string for an address with no @", () => {
    expect(emailDomainOf("not-an-address")).toBe("");
  });
});

describe("websiteHostOf", () => {
  it("strips scheme and a leading www, lowercased", () => {
    expect(websiteHostOf("https://WWW.NorthStarLabs.Example/about")).toBe("northstarlabs.example");
    expect(websiteHostOf("http://careers.example.co.in")).toBe("careers.example.co.in");
  });

  it("answers an empty string for junk", () => {
    expect(websiteHostOf("")).toBe("");
    expect(websiteHostOf("not a url")).toBe("");
  });
});

describe("isFreeMailAddress", () => {
  it("classifies the common providers", () => {
    expect(isFreeMailAddress("someone@gmail.com")).toBe(true);
    expect(isFreeMailAddress("someone@outlook.com")).toBe(true);
    expect(isFreeMailAddress("someone@proton.me")).toBe(true);
    expect(isFreeMailAddress("someone@northstarlabs.example")).toBe(false);
  });
});

describe("signupDomainMatches", () => {
  it("matches an email domain to a company website host", () => {
    expect(signupDomainMatches("mira@northstarlabs.example", "https://www.northstarlabs.example")).toBe(true);
  });

  it("does not match across domains, subdomains, or empties", () => {
    expect(signupDomainMatches("mira@northstarlabs.example", "https://northstar.io")).toBe(false);
    // A subdomain of the company site is NOT the company's domain — strict
    // by design; the human queue is the fallback for every near-miss.
    expect(signupDomainMatches("mira@jobs.northstarlabs.example", "https://northstarlabs.example")).toBe(false);
    expect(signupDomainMatches("mira@northstarlabs.example", "")).toBe(false);
    expect(signupDomainMatches("", "https://northstarlabs.example")).toBe(false);
  });
});
