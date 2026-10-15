// Michigan's two statewide proposals on the Nov 3, 2026 ballot, in the
// official ballot wording certified by the Board of State Canvassers, as
// printed in the League of Women Voters of Michigan's 2026 proposal handout
// (lwvmi.org, dated 9/7/2026) and listed by Ballotpedia. Local proposals
// (millages, charter questions) vary by city and township and aren't here.

export const PROPOSALS_SOURCE = {
  lwv: 'https://lwvmi.org/wp-content/uploads/2026/09/BallotProposalHandout2026.pdf',
  ballotpedia: 'https://ballotpedia.org/Michigan_2026_ballot_measures',
};

export const PROPOSALS = [
  {
    id: 'proposal-2026-1',
    title: 'Proposal 2026-1: Hold a constitutional convention?',
    question: 'A proposal to convene a constitutional convention for the purpose of drafting a general revision of the State Constitution. Shall a convention of elected delegates be convened in 2027 to draft a general revision of the State Constitution for presentation to the state’s voters for their approval or rejection?',
    scope: { type: 'state' },
    plain: 'Michigan’s constitution requires this question every 16 years (last asked in 2010, when voters said no). A “yes” means electing delegates in 2027 to rewrite the 1963 constitution; whatever they draft would go back to voters for approval. A “no” keeps the current constitution, which can still be amended piece by piece.',
  },
  {
    id: 'proposal-2026-2',
    title: 'Proposal 2026-2: Campaign money from utilities and state contractors',
    question: 'A proposed initiated law to prohibit campaign contributions from certain regulated utilities and government contractors and apply campaign finance laws and regulations to additional types of political communications. The proposal would: prohibit regulated electric and gas utilities, contractors with over $250,000 annually in government contracts, and people and organizations with substantial connections to these utilities/contractors from making direct or indirect campaign contributions to those who run for or hold offices that impact them; expand laws regulating spending on political communications, including those requiring disclosing donor information, to apply to communications clearly identifying candidates or ballot questions, even if they do not expressly advocate voting for/against them; expressly apply the law requiring disclosure of who paid for political communications to internet political communications. Should this proposal be adopted?',
    scope: { type: 'state' },
    plain: 'A citizen-initiated law (561,000 signatures, certified by the Board of State Canvassers). A “yes” bars regulated electric and gas utilities, big state contractors and people closely tied to them from giving to the campaigns of officials who regulate them, and widens Michigan’s disclosure rules to ads that name a candidate or ballot question without saying “vote for” or “vote against,” including online ads. Backed by Money Out of Politics; opposed by Protect MI Free Speech.',
  },
];
