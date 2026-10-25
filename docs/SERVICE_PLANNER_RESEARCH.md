# Predictive service planner: research notes (Oct 2026)

Purpose: find out what services each major truck maker and engine maker calls for, so the planner can care for the fleet properly.

**Read this first.** I could not reach any maker's own service manual (Detroit, PACCAR, Cummins, Navistar, Eaton and Meritor all keep them behind dealer logins). What follows comes from published maker charts where a search found one (Volvo, Mack, Cummins, Bendix), from US government safety bulletins, and from fleet-software blogs. The blogs disagree with each other in places. Every number marked **verify** must be checked against the truck's own manual or a dealer before it is trusted. Maintenance intervals also change by model year, oil type and duty cycle.

## 1. What the planner holds today

- One mileage list per **truck make**: Freightliner, Peterbilt, Kenworth, International, Volvo, Mack, Western Star (migrations `20260120035906`, `20260120045332`).
- Intervals are in miles only. A truck gets the list for its make, nothing more specific.
- Every truck also gets an oil change, tire replacement, and 120-day inspection (Landstar requirement).

## 2. The main finding: the engine decides the oil interval, not the truck

Most trucks here are built by one company and powered by another maker's engine, so a list keyed on make alone is only a rough guide.

| Truck | Engines you may find |
|---|---|
| Freightliner, Western Star | Detroit DD13, DD15, DD16; Cummins X15 |
| Peterbilt, Kenworth | PACCAR MX-13 (also MX-11); Cummins X15 |
| Volvo | Volvo D13 (D11, D16 less common) |
| Mack | Mack MP7, MP8, MP10 |
| International | International A26; Cummins X15 |

The planner has no engine field, so a Cummins X15 in a Kenworth gets the PACCAR list. Adding an engine field to trucks would fix that, and it is the biggest improvement available.

## 3. Engine oil, filters and fuel filters (best sources first)

| Engine | Interval by duty | Source and confidence |
|---|---|---|
| Volvo D13/D11 (2017-2020, 42 L pan, VDS-4.5 oil) | 60,000 normal / 45,000 heavy / 35,000 severe mi. One step lower if idle time is over 30%. | Volvo's own chart. Good. Other approved oils: 55,000 / 40,000 / 30,000. |
| Mack MP7/MP8/MP10 (42 L pan, EOS-4.5) | 60,000 / 45,000 / 35,000 mi (about 1,700 / 1,300 / 825 hr). One step lower if idle is over 30%. | Mack's service poster. Good. Other approved oils: 55,000 / 40,000 / 30,000. |
| Mack MP10 (52 L pan) | 65,000 / 50,000 / 40,000 mi | Mack poster. Good. |
| Cummins X15 (2021 and newer) | 25,000 to 75,000 mi depending on fuel economy band. Fuel filter matches the oil interval if Valvoline Premium Blue is used. Up to 100,000 mi with oil sampling. One step lower if idle plus PTO is over 40%. | Cummins product pages. Good. |
| PACCAR MX-13 | Depends on idle percent and fuel economy, roughly 25,000 to 75,000 mi. Severe or vocational about 30,000. | PACCAR bulletin E256 is the real source. Not read. **Verify.** |
| Detroit DD13/DD15/DD16 | Blogs say about 75,000 efficient long haul, 60,000 long haul, 40,000 to 45,000 short haul, 25,000 to 35,000 severe, with 93K222 or 93K223 oil. | Blogs only, and they conflict (one says 55,000 to 60,000 for DD16). **Verify.** |
| International A26 | About 70,000 mi only with a Navistar oil-sampling program. 25,000 mi otherwise. | Vendor blogs. **Verify.** |

The seeded Freightliner 50,000 and PACCAR 75,000 values sit inside these ranges. The Volvo/Mack "PM B 75,000" is higher than Volvo's and Mack's own 60,000 normal-duty charts, so those two should be lowered or made duty-based.

## 4. Other services that apply to every make

These are the same regardless of truck maker, so they are the safest additions.

| Service | Interval | Source and confidence |
|---|---|---|
| Air dryer cartridge | 3 years or 300,000 mi for single-trailer line haul. 2 years for pickup and delivery or doubles. 1 year or 100,000 mi for severe service. Newer oil-coalescing cartridges: 24 months or 200,000 mi standard use, 12 months high use. | Bendix service bulletin. Good. Check the truck maker's own guidance first. |
| DPF ash cleaning | Volvo/Mack: 250,000 mi or 4,500 hr. Detroit: 300,000 to 400,000 mi. Cummins 2016 and newer: up to 500,000 mi (older 200,000). PACCAR: reported 200,000 (secondary). Often warning-light driven. | Mixed. Cummins and Volvo are published. **Verify per engine and year.** |
| DEF filter or DEF pump filter | Cummins X15: 300,000 mi or 6,750 hr. Others reported 150,000 to 500,000. | Cummins good, rest **verify.** |
| Valve lash (overhead) adjustment | Cummins X15: 500,000 mi, 10,000 hr or 60 months. PACCAR: inside the 150,000 service per the seeded list. | Cummins good. |
| Coolant | Test at 30,000 mi (Cummins). Extended-life coolant change about 600,000 mi, conventional about 300,000. | Coolant intervals are weak. **Verify** with the coolant brand. |
| Automated transmission fluid | Eaton Endurant: about 500,000 mi or 5 years for line haul (maker claim up to 750,000). Vocational 180,000 mi or 3 years. Needs a PS-386 fluid. Change the filter with the fluid. | Eaton lubricant table. Fair. |
| Drive axle oil | Full synthetic: Meritor guidance varies from 250,000 mi or 4 years up to 500,000 with pump and filter and approved oil. Standard oil: 100,000 mi or 1 year. | Weak. Use Meritor Maintenance Manual 1 and TP-9539. **Verify.** |
| Belts, tensioner | Seeded PACCAR value is 450,000 mi. | Not rechecked. |

## 5. Services I could not find a source for

Fifth wheel grease, kingpin, slack adjuster and chassis lube (the seeded 25,000 mi is a common practice but I found no maker number), wheel seals and hub oil, brake relining, clutch, steering, suspension, battery, alternator, and starter. These need the maker's chassis lube chart or the component maker's manual.

## 6. Truck makes with nothing found

Autocar, Isuzu and Hino (XL series, A09 engine) have no intervals in anything I could reach. Western Star is built on Freightliner's system, with Detroit or Cummins engines.

## 7. Ways to improve the planner (nothing built yet)

1. Add **engine** and **duty cycle** (normal, heavy, severe) to each truck, so the oil interval comes from the right chart.
2. Add the **engine-neutral services** from section 4 as mileage items, flagged "verify" in the description until a mechanic confirms them.
3. Let the planner use **months and hours**, not only miles. Most of these services are "miles or time, whichever comes first", and the planner currently ignores time for manufacturer services.
4. Lower the Volvo and Mack oil service to 60,000 to match their own charts.
5. Have the shop owner confirm the final numbers once, using the manuals that come with the trucks.

## Sources

- Volvo maintenance poster, 2017-2020: https://www.volvotrucks.us/media/vtna/files/shared/parts-and-services/maintenance-intervals/2021/saag-2017-2020-poster-062221-eng.pdf
- Volvo service and maintenance intervals: https://www.volvotrucks.ca/en-ca/parts-and-services/services/service-and-maintenance-intervals
- Mack service at a glance poster: https://macktrucks.hn/media/files/brochures/vol-15033b-22x34-mack-service-at-a-glance-poster-v8.pdf
- Mack 2010-2016 schedules: https://macktrucks.ca/media/files/parts-and-service/support/2010-2016-mack-trucks-granite-pinnacle-granite-terrapro-titan-anthem-service-maintenance-schedules.pdf
- Cummins X15 Efficiency Series (2024): https://www.cummins.com/engines/x15-efficiency-series-2024
- Cummins X15 Performance Series (2021): https://www.cummins.com/engines/x15-performance-series-2021
- Cummins X15 quick reference: https://knowledge.tiffinmotorhomes.com/@api/deki/files/96582/Cummins_X15_605_Engine.pdf?revision=1
- Bendix air dryer cartridge intervals: https://vehicleservicepros.com/21010245 and https://static.nhtsa.gov/odi/tsbs/2014/SB-10055257-6438.pdf
- DPF cleaning: https://fleetowner.com/equipment/article/21692743/cummins-extends-dpf-cleaning-interval-for-isx15 and https://www.ccjdigital.com/in-focus-dpf-cleaning/ and https://www.chevronlubricants.com/content/dam/external/delo/en_us/sales-material/brochures/DPF_Intervals_Brochure.pdf
- Eaton lubricant specifications: https://www.eaton.com.cn/cn/zh-cn/products/transmissions/lubricants/eaton-transmission-and-clutch-lubrication-specifications.html
- Endurant launch coverage: https://www.ccjdigital.com/eaton-cummins-debuts-new-12-speed-automatic/
- Freightliner bulletin with M2/M3 labels (steering bellows only): https://static.nhtsa.gov/odi/tsbs/2022/MC-10222228-0001.pdf
- PACCAR guides (third party): https://heavyvehicleinspection.com/blog/post/paccar-mx13-pm-schedule and https://fleetrabbit.com/article/paccar-mx-13-maintenance-schedule
- Detroit guides (third party): https://fleetrabbit.com/blogs/post/detroit-dd15-service-intervals
- International A26 guide (third party): https://heavyvehicleinspection.com/blog/post/international-a26-maintenance-lt-lonestar
- Meritor lubrication bulletin TP-9539 (referenced): https://trucknews.com/transportation/pennzoil-long-life-lube-gets-arvinmeritor-approval/1003116959
- Western Star guides (third party): https://heavyvehicleinspection.com/blog/post/western-star-preventive-maintenance-schedule
