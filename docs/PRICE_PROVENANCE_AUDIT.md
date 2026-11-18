# Historical price provenance audit

This release preserves the owner's thirteen monetary values and the existing site layout. Actual private prices/identities are not committed. Detailed findings are stored only alongside the owner's private notes and in the private release report.

## Findings and behavior

- An undated owner note cannot be identified solely by matching a rounded number. Preserve the historical value and unknown assessment date. Publication dates are separate. A current quote does not invalidate an older one.
- A00 aluminum, 1# tin and 0# zinc series specify distinct quality standards and Chinese warehouse bases. Their published source tax treatment does not prove the treatment of an undated owner note. Preserve this distinction in `series_context`, rather than assigning a guessed VAT rate or date.
- Niobium metal and FeW have China EXW comparison series; do not substitute European prices, contained-metal units or a different grade. An unresolved comparison is not promoted to a verified regional observation.
- FeMo's European DDP publication describes a single trade, not a market average. Mark it `single_trade`; retain kg of contained Mo. FeW remains kg of alloy. No assay-based mass conversion is inferred.
- The old tungsten page's FOB title conflicts with its EXW description. Keep the conflict explicit and do not assign a confirmed market basis from a company address.
- The prior VAT-excluded labels for the undated Ta and Zr notes lacked sufficient dated provenance. Without owner attestation or matching dated evidence, their original tax status remains unknown. Copper's owner-provided ex-VAT label is retained with its verification limitation.
- SMM's November 13 USD-method announcement applies to historical USD displays too. It is a possible comparison consideration, not proof of why a particular old note differs. Never recompute prices using an assumed FX or VAT factor.

## Data model and UI

The additive migration stores input currency/unit separately from the publisher's comparison-series currency/unit, VAT rate when explicitly known, tax verification status, assessment type and comparison context. Input fields are USD/kg because these notes were supplied already normalized to USD/kg; publisher metadata may be CNY/tonne, CNY/kg or USD/lb and is never used to silently recalculate them.

Independent observations can share metal/snapshot while having different `series_key` values. Existing strict regional selection is retained; the common price renderer exposes additional owner observations without merging their specifications. Supplier offers remain excluded. Public World Bank history remains separate.

Tax representations are child rows of one observation, never additional market samples. Each requires a dated matching parent, published evidence and confirmed use permission. Their values are supplied explicitly; no VAT division or synthesized endpoints are performed. Unknown-date parent notes cannot acquire a tax view. The shared renderer prefers an available confirmed ex-VAT representation, labels it “Без НДС”, and retains the original view for comparison.

All new tables preserve owner-only RLS; anonymous access and browser writes are denied. Private notes/tax views never enter exports, price analytics or Groq. No provider collector, secret or Auth configuration is changed. The protected real-login smoke checks the actual nested Data API query after migration.

## Source references

- [A00 series](https://www.metal.com/aluminum/201102250311)
- [1# tin series](https://www.metal.com/tin/201102250140)
- [0# zinc series](https://www.metal.com/zinc/201102250173)
- [Niobium metal](https://www-old.metal.com/Niobium-Tantalum/201102250606)
- [FeW ≥70%](https://www-old.metal.com/Tungsten/201606010002)
- [Cr 99%](https://www-old.metal.com/Chromium/201102250234)
- [Tungsten ingot](https://www-old.metal.com/Tungsten/202212260004)
- [Copper cathode](https://www-old.metal.com/Copper/201102250376)
- [Zirconium sponge](https://www-old.metal.com/Other-Minor-Metals/201102250232)
- [Tantalum ingot](https://www-old.metal.com/Niobium-Tantalum/202211090002)
- [Cobalt category: exact owner series unresolved](https://www.metal.com/cobalt)
- [DMP molybdenum](https://www.dailymetalprice.com/molybdenum.html) and [DMP terms](https://www.dailymetalprice.com/disclaimer.php)
- [SMM USD method notice](https://www.metal.com/announcements/BGDUHPEOT457LNAIMXSWAU2FQH722POTZV3IMZI-smm-announcement-notice-on-the-adjustment-of-usd-price-calculation-and-exchange-rate-display)
- [SMM terms](https://www.metal.com/compliance-center/terms-and-conditions)

SMM/DMP do not grant automatic copying rights merely because a page is visible. No new licensed quote feed or tax-price data is imported; only existing owner notes receive audit metadata. No Argus values are used.

## Release

Back up current private rows and previous production SHA. Apply only the additive migration to ALFA, align its local filename with the actual version without rewriting history, then update metadata separately (all numeric values must compare equal). Deploy only the protected verification smoke, require real Auth/RLS checks, anonymous/other-user denial, local tests and green PR CI. Merge the exact checked head and await the existing Pages workflow. Validate domain bundle and desktop/mobile key gate. If checks fail, keep the PR unmerged; the old frontend remains compatible with the additive schema. Rollback frontend to the saved SHA if needed; retain rows and migration history.
