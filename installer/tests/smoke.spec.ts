import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("app responds",async({page})=>{const r=await page.goto("/");expect(r).not.toBeNull();expect(r!.status()).toBeLessThan(500);});
test("no critical accessibility violations",async({page})=>{await page.goto("/");const x=await new AxeBuilder({page}).analyze();expect(x.violations.filter(v=>v.impact==="critical")).toEqual([]);});
