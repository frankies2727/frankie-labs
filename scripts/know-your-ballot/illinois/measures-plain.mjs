// What each referendum is and why it's on the ballot, in plain words, for
// the Illinois guide (Michigan's proposals carry theirs in proposals.mjs).
// Matched by the question's title, so the same words cover a question asked
// in several precincts. Advisory questions bind nobody: they tell officials
// what voters think. Written from the Board's ballot text and local
// reporting (Block Club Chicago, WTTW, NBC Chicago, Fox 32, Oct 2026);
// edit here when a question changes.

const PLAIN = [
  [/millionaire amendment/i,
    'Advisory: it changes no law by itself. The Cook County Board put it on every county ballot in July to gauge support for a statewide constitutional amendment (a proposal in the Illinois House, backed by House Speaker Welch and Mayor Johnson) adding a 3% surcharge on income over $1 million; Illinois’ constitution requires a flat income tax, so a real change would need a statewide vote. Supporters say it would raise about $4 billion a year from roughly 41,000 taxpayers for property-tax relief and schools; opponents say it would push high earners and employers out of the state.'],
  [/gunshot detection/i,
    'Advisory. Chicago ended its ShotSpotter contract in September 2024 after Mayor Johnson questioned the system’s accuracy and cost; a replacement has been promised but not chosen. Ald. Marty Quinn (13th), a ShotSpotter supporter, got this question onto the ballot to put voters on record. A “yes” signals the city should bring gunshot-detection sensors back; a “no” that it should stay without them.'],
  [/festival/i,
    'Advisory. Lollapalooza in Grant Park, Riot Fest in Douglass Park and other festivals close public parks for weeks and leave damage behind. Ald. Nicole Lee (11th) proposed asking whether the city should build a permanent fairgrounds for big events instead; there is no site or cost yet. A “yes” tells the city to pursue one.'],
  [/midway blitz/i,
    'Advisory, backed by Mayor Johnson. “Operation Midway Blitz” was the federal immigration enforcement surge in Chicago in fall 2025, with more than 3,800 people detained; a University of Illinois Chicago study put the loss to immigrant business corridors above $1 billion. A “yes” says the city should try, in court or otherwise, to make the federal government pay for its costs and lost revenue; how it would is not spelled out.'],
  [/millionaires surcharge/i,
    'Advisory, from the Chicago Board of Education, and broader than the county’s question on the same idea: it asks only whether money from a tax surcharge on millionaires should go to public schools. The school board added it in August, with the vacant-property question below, to show support for new school funding.'],
  [/chicago land owners/i,
    'Advisory, from the Chicago Board of Education. It asks whether owners of commercial or investment property left vacant or undeveloped for a long time should pay an extra yearly charge, with the money going to Chicago Public Schools. Board members split: some said it would push owners to build and fund schools, others doubted it could be enforced fairly.'],
  [/property tax extension.*mental health/i,
    'Binding, and paired with the question above it: if the program is created, this sets how much property tax it may collect for 2027 (the dollar cap in the question, spread over the area’s property owners). A “no” here with a “yes” above would leave the program without that budget.'],
  [/mental health services/i,
    'Binding. Under Illinois’ Community Expanded Mental Health Services Act, residents of an area can petition to create a program offering free mental-health care to anyone living there, paid for by a small property-tax levy (capped at 0.025% of the area’s equalized assessed value) and run by a locally elected governing commission. Several Chicago neighborhoods have voted such programs in since 2012. A “yes” creates one for the area named on your ballot.'],
  [/jesse jackson/i,
    'Advisory, by petition in the 4th Ward. It asks whether the city should place a life-size statue of the Rev. Jesse L. Jackson Sr., the civil-rights leader and founder of Rainbow PUSH who died in February 2026, in the median near the organization’s Kenwood headquarters. A “yes” tells the alderperson and the city to pursue it.'],
  [/shared housing/i,
    'Advisory, by petition in the 26th Ward. Chicago’s shared-housing ordinance already lets precincts vote to restrict short-term rentals (Airbnb-style listings); this asks whether the whole ward should limit new ones, on the argument that they take apartments off the long-term rental market.'],
  [/lakefront national park/i,
    'Advisory, by petition. A campaign wants Chicago’s lakefront parks, harbors and lagoons nominated as a unit of the National Park Service; a national park would be designated by Congress. A “yes” says the city should support the nomination.'],
  [/remediation of former south works/i,
    'Advisory, by petition in the 7th and 10th Wards. The former U.S. Steel South Works site on the Southeast Side lakefront, vacant since 1992, is the planned home of the Illinois Quantum and Microelectronics Park. Neighbors (organized as Southside Together) want a guarantee that the soil and slag there are fully cleaned up, with the results made public, before anything is built. The Board of Elections threw out an earlier, multi-part version in March; this and the question below are the single-topic versions.'],
  [/quantum facility and data center/i,
    'Advisory, by petition in the 7th and 10th Wards. The state has pledged public money for the quantum campus at the former South Works site, anchored by PsiQuantum, with a data center alongside. The question asks whether governments should spend an estimated $1 billion of taxpayer money on it. Supporters point to jobs and investment; neighbors who petitioned for this question want the land cleaned up and used for the community instead.'],
  [/500\+? employee corporate tax/i,
    'Advisory, by petition in a handful of precincts. During the 2026 city budget fight, Mayor Johnson proposed a “head tax” of $33 per employee on companies with 500 or more workers (about 175 firms, grocery stores and nonprofits excluded) to fund youth jobs, mental-health care and violence prevention; the City Council did not adopt it. A “yes” asks your alderperson to vote for such a tax.'],
  [/prohibit.*alcohol|alcohol.*prohibit/i,
    'Binding, under Illinois’ local-option law, and only for this precinct, which has voted itself “dry.” A “yes” keeps the ban on stores and bars selling alcohol there; a “no” lifts it.'],
];

/** Give each measure its `plain` words, where there are some. */
export function explainMeasures(measures) {
  for (const m of measures) {
    const hit = PLAIN.find(([re]) => re.test(m.title));
    if (hit) m.plain = hit[1]; else delete m.plain;
  }
}
