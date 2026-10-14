// Plain-English "what does this job actually do" for every office on a Chicago
// ballot. Kept factual and neutral: duties and term, never an opinion.

const EXPLAINERS: [RegExp, string][] = [
  [/^United States Senator/, 'One of Illinois’ two U.S. senators. Votes on federal laws, confirms federal judges and cabinet members, and approves treaties. 6-year term.'],
  [/^U\.S\. Representative/, 'Your district’s seat in the U.S. House. Writes and votes on federal laws and the federal budget. 2-year term.'],
  [/^Governor/, 'Runs Illinois’ executive branch: proposes the state budget, signs or vetoes bills, appoints agency heads. Governor and lieutenant governor run as a team. 4-year term.'],
  [/^Attorney General/, 'Illinois’ top lawyer. Represents the state in court and enforces consumer-protection, civil-rights and public-access laws. 4-year term.'],
  [/^Secretary of State/, 'Runs driver’s licenses, ID cards and vehicle registration, and keeps the state’s official records. 4-year term.'],
  [/^Comptroller/, 'The state’s bill-payer and bookkeeper: pays Illinois’ bills and reports on its finances. 4-year term.'],
  [/^Treasurer$/, 'Manages and invests the state’s money and runs programs like unclaimed property and college savings. 4-year term.'],
  [/^State Senator/, 'Your seat in the Illinois Senate. Writes and votes on state laws and the state budget in Springfield.'],
  [/^State Representative/, 'Your seat in the Illinois House. Writes and votes on state laws and the state budget in Springfield. 2-year term.'],
  [/^Metropolitan Water Reclamation/, 'Runs the Metropolitan Water Reclamation District: wastewater treatment and flood and stormwater control for most of Cook County.'],
  [/^President of County Board/, 'Leads Cook County government: the county budget, public hospitals and clinics, and funding for the courts and jail. 4-year term.'],
  [/^County Clerk/, 'Keeps Cook County’s records (births, marriages, deaths, property deeds) and calculates property tax rates. 4-year term.'],
  [/^County Sheriff/, 'Runs the Cook County Jail, provides courthouse security and patrols unincorporated areas. 4-year term.'],
  [/^County Treasurer/, 'Collects Cook County property taxes and distributes them to schools, the city and other local governments. 4-year term.'],
  [/^County Assessor/, 'Sets the value of every property in Cook County — the starting point for property tax bills. 4-year term.'],
  [/^County Commissioner/, 'One of the 17 members of the Cook County Board. Votes on the county budget, taxes and ordinances. 4-year term.'],
  [/^Board of Review/, 'Hears appeals from property owners who think their assessed value is too high.'],
  [/^Judge of the Appellate Court/, 'Hears appeals from trial courts in Cook County. 10-year term.'],
  [/^Judge of the Circuit Court/, 'A Cook County trial-court judge, elected countywide: criminal, civil, family and traffic cases. 6-year term.'],
  [/^Judge, .*Subcircuit/, 'A Cook County trial-court judge, elected by voters in your subcircuit only: criminal, civil, family and traffic cases. 6-year term.'],
  [/^President of the Chicago Board of Education/, 'Leads the Chicago Board of Education, which sets Chicago Public Schools policy and budget and hires the CEO. Nonpartisan.'],
  [/Board of Education, Subdistrict/, 'Your member of the Chicago Board of Education, which sets Chicago Public Schools policy and budget and hires the CEO. Nonpartisan.'],
];

export const explainOffice = (office: string): string =>
  EXPLAINERS.find(([re]) => re.test(office))?.[1] ?? '';

export const RETENTION_EXPLAINER =
  'Should this sitting judge keep the job for another term? There’s no opponent: a judge needs at least 60% “Yes” votes to stay. Appellate judges who stay serve 10 more years, circuit judges 6. Circuit judges are listed by how long they’ve served.';
