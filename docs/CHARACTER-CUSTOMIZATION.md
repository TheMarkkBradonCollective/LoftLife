# Character appearance and wardrobe

LoftLife characters use one normal-proportion human rig across the world,
the live studio preview and the clothing shop. Height and build scale that same
skeleton; heads stay normal-sized because the head is counter-scaled against
the torso. Every hairstyle, clothing layer, accessory and animation anchor is
authored against the shared rig, so a saved look is portable.

## Appearance categories

| Category | Options | Cost |
| --- | --- | --- |
| Body | balanced / soft / athletic / broad preset, petite / average / tall height, slim / average / athletic / curvy build, six skin tones | Foundational |
| Face | oval / square / heart / round structure, almond / round / hooded / upturned eyes, six eye colours, four eyebrow shapes, freckles / beauty mark / scar / blush details, five facial-hair styles | Foundational |
| Hair | 18 hairstyles and eight hair colours | Free at a bathroom mirror or salon |
| Makeup | none / natural / soft / bold | Free at a bathroom mirror or salon |
| Wardrobe | 14 tops, 7 bottoms, 7 accessories, 4 jewelry pieces, 3 bags, colour swatches, shoes | Owned pieces only |
| Outfits | unlimited named outfits, account-synced | Free |

The shared lists and defaults live in [`shared/character.mjs`](../shared/character.mjs).
`npm run check:character` guards the catalogue, starter ownership and the split
between free and foundational fields.

## Paid Character Makeover

Creating a character (registration or offline adoption) is free. After that,
changing any foundational field is a one-off **Character Makeover** costing
**250 yuanzi**. Hair, makeup and clothing never require a makeover.

- `PATCH /api/profile` accepts free changes only. A foundational change is
  rejected with `403` and a message naming the fields.
- `POST /api/character/makeover` validates the complete avatar, enforces
  wardrobe ownership, charges the server-owned price through the ledger and
  returns the updated profile and wallet.
- The makeover request carries an idempotency key, so retrying a lost response
  cannot charge twice. If the profile already has the requested foundations,
  the endpoint returns `charged: 0`.
- The studio shows the exact fields that triggered the makeover and the price
  before applying.

## Wardrobe and shops

`GET /api/shop` returns the server-owned furniture and clothing catalogue with
prices and currencies. The 33 purchasable clothing pieces span tops, bottoms,
accessories, jewelry and bags. Free starter ownership is `tee`, `jeans` and
`none`, so a new or legacy character is never locked out of dressing.

- The shop is browse-and-purchase. Selecting a rack item renders it on the
  live 3D character before purchase.
- Purchases go through `POST /api/economy/purchase` with an idempotency key and
  land in the account inventory.
- `PATCH /api/profile` and `POST /api/outfits` reject any unowned top, bottom,
  accessory, jewelry or bag. Shoes and clothing colours are free adjustments.
- Wearing is only exposed in the home closet. Browsing and buying happen at
  LoftLife Threads.

## Account outfits

Outfits contain only wardrobe fields; foundational appearance is never copied
into an outfit.

- `GET /api/auth/me` includes `outfits` so a new device receives the closet on
  sign-in.
- `GET /api/outfits`, `POST /api/outfits` and `DELETE /api/outfits/:id` manage
  unlimited named outfits.
- Outfits are stored in `outfits` (SQLite) / `ll_outfits` (Neon), scoped by the
  account id. A username or device id is never trusted.
- Guests and offline play keep a local-device outfit fallback; signed-in
  accounts always use the account copy.

## Interface

The studio has a live 3D preview with front, three-quarter, side and back
angles, drag orbit and zoom. Desktop uses a preview/controls split; phones use
a stacked full-screen layout. The theme toggle switches the studio between
light and dark and is remembered on the device. Category navigation only shows
surfaces valid for the current place: mirror (hair/makeup), salon (body, face,
hair, makeup), closet (wardrobe/outfits) and the general character studio.

## Persistence and limits

Appearance JSON, inventory and outfits are account rows. The Node authority
and Cloudflare Worker share the same enums, defaults, starter ownership,
foundational-field list, makeover price and clothing catalogue. Schema is in
`migrations/0009_character_customization.sql` and the Worker's idempotent
schema statements.

Current limits:

- The wardrobe is a curated catalogue; there are no custom meshes, user-uploaded
  garments or per-garment pattern editing.
- Outfit thumbnails are colour/label previews; the live 3D preview renders the
  actual garment layers.
- The preview uses the gameplay rig, not a separate high-detail portrait rig.
- Foundational makeovers are a one-off charge per request; there is no bundled
  multiple-look package.
