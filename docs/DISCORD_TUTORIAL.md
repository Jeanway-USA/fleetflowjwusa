## MESSAGE 1
# 💼 FleetFlow Pay System: Getting Started
Pay is now **configured, not coded**. Every rate, bonus and deduction lives in a **Pay Package** that you build yourself, and nothing is hard-coded.

**How the pieces fit**
> **Pay Package** → how someone is paid (the pay lines and how each is worked out)
> **Position** → a kind of job (Company Driver, Dispatcher...) with a default package, documents, checklist and role
> **Assignment** → who is on which package/position, and from what date

**Where to find it:** `Settings` → `Compensation`, with three tabs: **Pay Packages**, **Positions**, **Staff Pay**.

**Who can do what**
✅ Owners and Payroll Admins: create, edit, assign, approve
👀 Everyone else: sees only their own package, position and pay statements

**Nothing is ever deleted.** Packages, positions and statements are archived (with Undo), and every package save keeps a version, so old settlements always show the pay rules they were paid under.

---

## MESSAGE 2
# 1️⃣ Build a Pay Package
`Settings` → `Compensation` → `Pay Packages` → **New package**

**Details:** name, who it's for, active/inactive, optional start and end dates.

**Pay lines:** press **Add pay line** for each part of the pay. Lines are worked out top to bottom. Drag a line (or use the ▲▼ arrows) to reorder.

**Each line has:**
• **Name** shown on the statement
• **Type:** base pay, safety bonus, performance bonus, mileage bonus, detention, share of extra charges, benefit, deduction, advance recovery, escrow contribution, custom
• **How it is worked out:** flat weekly, flat per day worked, per mile, % of what the truck earned, % of everything billed, one fixed amount, or a formula
• **Amount**, plus switches for **Taxable**, **Takes money off the pay**, **Included**

**Example: $1,700 weekly base**
```
Name: Weekly base
Type: Base pay
How: Flat amount each week
Amount: 1700
```
Press **Create package**.

---

## MESSAGE 3
# 🧮 Live Preview and Formulas
The right side of the editor is a **live preview**. Change the sample week (miles, billed, loads, days, incidents...) and watch every line recalculate as you edit.

**Formulas** are for anything custom. Use these names:
`miles` `gross` `net` `loads` `days` `accessorials` `detention_hours` `detention_pay` `incidents` `base` `earnings`

**Examples**
```
Safety bonus:   incidents == 0 ? base * 0.1 : 0
Mileage cap:    min(miles * 0.55, 1200)
Volume bonus:   loads >= 5 ? 150 : 0
```
`base` is the total of base-pay lines above it, and `earnings` is every earning line above it, so **line order matters**.

If a formula has a problem, the editor says what is wrong in plain English and won't let you save. A formula can't run code, only pay maths.

**Version history:** the **History** button on a package shows every saved version, and lets you pick any past date to see exactly how the package read that day.

**Duplicate** copies a package so you can tweak it without touching the original. **Archive** hides it (Undo available).

---

## MESSAGE 4
# 2️⃣ Positions
`Settings` → `Compensation` → `Positions`

The standard positions are created for you: **Owner-Operator, Company Driver, Lease Purchase, Dispatcher, Safety Manager, Mechanic, Broker, Admin, Custom.** Edit any of them, archive the ones that do not apply to you (for example Owner-Operator, if every driver works under your own authority), or press **New position** to add your own.

**Each position holds**
• **Default pay package** (link any package)
• **Account role** and whether onboarding is required
• **Areas** the job uses (loads, dispatch, fleet, payroll...)
• **Required documents** (W-4, I-9, W-9, owner-operator agreement, plus your own templates)
• **Onboarding checklist** (your own steps, reorder with the arrows)

Choosing a position only **suggests** these defaults. Every one can still be changed for the individual person.

**Assign to many drivers:** on the Positions tab, press **Assign to many drivers**, pick a position and/or package, tick the drivers, press Apply. Anyone who already has it is skipped, and earlier assignments stay as history.

---

## MESSAGE 5
# 3️⃣ Put People on a Package
**Drivers:** open the driver's profile.
• **Position:** choose one and a start date. The linked pay package is pre-filled below it.
• **Pay package:** pick the package and the date it takes effect, then **Assign**.
• Their onboarding checklist and signed-document status show under Position. The "added to the pay package" step ticks itself when you assign.

**Staff:** `Settings` → `General` → `Team`, open the person's menu, **Position & pay**.

**Hiring someone new:** `Invite Member`, choose a **Position**. Role, onboarding and pay package are filled in (all editable), and are applied automatically when they accept the invitation.

**Changing pay mid-year:** assign a different package with a new start date. The old one ends the day before, and settlements keep the package they were paid under.

**One-week changes:** on a driver's profile, **One-period overrides** → **Add**. Change an amount, swap in a formula, leave a line out, or add a one-off line (like a holiday bonus) for one settlement period only. A reason is required, and you can cancel it later (it stays on record).

---

## MESSAGE 6
# 4️⃣ Run Pay
**Drivers:** `Money` → **Payroll** tab → **Generate settlements**. (Drivers see their own finished statements under **My Settlements**.)
• Drivers **with a package** are paid from it, using that week's delivered loads, miles, revenue, detention and incidents.
• Drivers **without one** are paid the way they always were. Nothing changes for them.
• Regenerating replaces a **draft** (the old one is archived, never deleted). Approved or paid settlements are never touched.
• Open a settlement to see **"Paid under [package], version N"** with every line and how it was worked out. This is frozen, so editing the package later can't change it.
• If a package is switched off or outside its dates, that driver is skipped with a clear reason instead of being paid the wrong way.

**Staff:** `Settings` → `Compensation` → `Staff Pay`. Pick the **pay period end**, press **Make statements**, then **Approve** → **Mark paid**. Paid statements are locked, and you can export to CSV. Staff pay is shown **before taxes**.

---

## MESSAGE 7
# 5️⃣ Limiting Access, and What Drivers See
**Limit someone to their position's areas:** on their profile (or Team → Position & pay), switch on **Limit to this position's areas**.
• Pages outside those areas disappear and are blocked, and the data is protected at the database level too.
• A limit only **narrows** what their role already allows. It never gives extra access. Owners can't be limited.
• Turn it off any time and their role decides again.

**What drivers see:** a **My job** card on their home screen with their position, onboarding steps, documents to sign and the **name** of their pay package. Only their own.

**Quick checklist for a new setup**
✅ Create your packages
✅ Link each to its position
✅ Bulk-assign existing drivers
✅ Generate one settlement and compare it with what you expect before switching everyone over

Questions or something looks off? Post a screenshot here. 🚛
