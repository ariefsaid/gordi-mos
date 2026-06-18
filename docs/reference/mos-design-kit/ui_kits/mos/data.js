/* MOS Design Kit — mock data + formatters for the Acme Inc workspace.
   Generic, illustrative. Exposes window.MOS_DATA, window.fmtMoney, window.fmtNum. */
(function () {
  window.MOS_DATA = {
    workspace: 'Acme Inc',
    user: { name: 'Arief Said', email: 'arief@acme.example', role: 'Workspace admin' },

    companies: [
      { id: 'c1', name: 'Northwind Traders', domain: 'northwind.example', arr: 1240000, employees: 420, stage: 'Customer', owner: 'Maya Chen', location: 'Austin, TX', tags: ['Enterprise', 'Renewal'], website: 'northwind.example', phone: '+1 (512) 555-0142', people: ['Maya Chen', 'Devon Park', 'Priya Rao'] },
      { id: 'c2', name: 'Contoso Manufacturing', domain: 'contoso.example', arr: 860000, employees: 1280, stage: 'Customer', owner: 'Devon Park', location: 'Detroit, MI', tags: ['Enterprise'], website: 'contoso.example', phone: '+1 (313) 555-0188', people: ['Devon Park', 'Lena Ortiz'] },
      { id: 'c3', name: 'Fabrikam Labs', domain: 'fabrikam.example', arr: 312000, employees: 96, stage: 'Proposal', owner: 'Priya Rao', location: 'Boston, MA', tags: ['SMB', 'Pilot'], website: 'fabrikam.example', phone: '+1 (617) 555-0117', people: ['Priya Rao'] },
      { id: 'c4', name: 'Globex Corporation', domain: 'globex.example', arr: 2040000, employees: 2100, stage: 'Customer', owner: 'Maya Chen', location: 'Seattle, WA', tags: ['Enterprise', 'Strategic'], website: 'globex.example', phone: '+1 (206) 555-0150', people: ['Maya Chen', 'Owen Grant'] },
      { id: 'c5', name: 'Initech Services', domain: 'initech.example', arr: 148000, employees: 54, stage: 'Qualified', owner: 'Lena Ortiz', location: 'Austin, TX', tags: ['SMB'], website: 'initech.example', phone: '+1 (512) 555-0133', people: ['Lena Ortiz'] },
      { id: 'c6', name: 'Umbrella Logistics', domain: 'umbrella.example', arr: 540000, employees: 310, stage: 'Negotiation', owner: 'Owen Grant', location: 'Denver, CO', tags: ['Mid-market'], website: 'umbrella.example', phone: '+1 (303) 555-0166', people: ['Owen Grant', 'Priya Rao'] },
      { id: 'c7', name: 'Stark Industries', domain: 'stark.example', arr: 0, employees: 5200, stage: 'Lead', owner: 'Maya Chen', location: 'New York, NY', tags: ['Enterprise', 'Strategic'], website: 'stark.example', phone: '+1 (212) 555-0177', people: ['Maya Chen'] },
      { id: 'c8', name: 'Wayne Holdings', domain: 'wayne.example', arr: 720000, employees: 880, stage: 'Customer', owner: 'Devon Park', location: 'Gotham, NJ', tags: ['Mid-market'], website: 'wayne.example', phone: '+1 (201) 555-0199', people: ['Devon Park'] },
      { id: 'c9', name: 'Hooli Cloud', domain: 'hooli.example', arr: 980000, employees: 640, stage: 'Proposal', owner: 'Priya Rao', location: 'San Jose, CA', tags: ['Mid-market', 'Pilot'], website: 'hooli.example', phone: '+1 (408) 555-0102', people: ['Priya Rao', 'Lena Ortiz'] },
      { id: 'c10', name: 'Pied Piper', domain: 'piedpiper.example', arr: 64000, employees: 18, stage: 'Qualified', owner: 'Owen Grant', location: 'Palo Alto, CA', tags: ['Startup'], website: 'piedpiper.example', phone: '+1 (650) 555-0144', people: ['Owen Grant'] },
    ],

    opportunities: [
      { id: 'o1', name: 'Annual platform upgrade', company: 'Northwind Traders', amount: 480000, stage: 'Closed Won', closeDate: '2026-03-12', owner: 'Maya Chen' },
      { id: 'o2', name: 'Data warehouse expansion', company: 'Globex Corporation', amount: 720000, stage: 'Negotiation', closeDate: '2026-07-02', owner: 'Maya Chen' },
      { id: 'o3', name: 'Pilot — analytics suite', company: 'Fabrikam Labs', amount: 96000, stage: 'Proposal', closeDate: '2026-06-21', owner: 'Priya Rao' },
      { id: 'o4', name: 'Fleet routing rollout', company: 'Umbrella Logistics', amount: 310000, stage: 'Negotiation', closeDate: '2026-06-30', owner: 'Owen Grant' },
      { id: 'o5', name: 'Identity SSO add-on', company: 'Contoso Manufacturing', amount: 120000, stage: 'Proposal', closeDate: '2026-07-15', owner: 'Devon Park' },
      { id: 'o6', name: 'Compliance audit pack', company: 'Wayne Holdings', amount: 88000, stage: 'Qualified', closeDate: '2026-08-05', owner: 'Devon Park' },
      { id: 'o7', name: 'Edge inference pilot', company: 'Hooli Cloud', amount: 205000, stage: 'Proposal', closeDate: '2026-07-09', owner: 'Priya Rao' },
      { id: 'o8', name: 'Startup tier — growth', company: 'Pied Piper', amount: 24000, stage: 'Lead', closeDate: '2026-09-01', owner: 'Owen Grant' },
      { id: 'o9', name: 'Enterprise expansion', company: 'Stark Industries', amount: 1500000, stage: 'Lead', closeDate: '2026-10-15', owner: 'Maya Chen' },
      { id: 'o10', name: 'Renewal — tier 2', company: 'Initech Services', amount: 54000, stage: 'Qualified', closeDate: '2026-08-20', owner: 'Lena Ortiz' },
    ],

    stageColor: {
      'Lead': 'gray', 'Qualified': 'sky', 'Proposal': 'amber',
      'Negotiation': 'iris', 'Customer': 'green', 'Closed Won': 'green',
      'Closed Lost': 'red',
    },
    stageDot: {
      'Lead': 'gray', 'Qualified': 'sky', 'Proposal': 'amber',
      'Negotiation': 'iris', 'Closed Won': 'green', 'Customer': 'green',
    },

    // Feed + notes for record pages (shared, keyed loosely by company)
    timeline: [
      { id: 't1', glyph: 'phone', text: 'Discovery call with procurement', time: '2h ago' },
      { id: 't2', glyph: 'mail', text: 'Sent revised statement of work', time: 'Yesterday' },
      { id: 't3', glyph: 'user-plus', text: 'Priya Rao joined the deal team', time: '3d ago' },
      { id: 't4', glyph: 'currency-dollar', text: 'ARR updated to $1.24M', time: '5d ago' },
    ],
    notes: [
      { id: 'n1', author: 'Maya Chen', body: 'Renewal on track. Champion moving to VP Eng — keep her close through sign-off.', time: '1d ago' },
      { id: 'n2', author: 'Devon Park', body: 'Procurement wants net-60 terms. Looping in Finance for approval before the 30th.', time: '4d ago' },
    ],
    tasks: [
      { id: 'tk1', text: 'Send MSA redlines', due: 'Tomorrow', done: false },
      { id: 'tk2', text: 'Confirm go-live date', due: 'Jun 24', done: false },
      { id: 'tk3', text: 'Intro to new champion', due: 'Jun 20', done: true },
    ],
    files: [
      { id: 'f1', name: 'statement-of-work.pdf', size: '248 KB' },
      { id: 'f2', name: 'security-review.docx', size: '1.1 MB' },
    ],
  };

  window.fmtMoney = function (n) {
    if (n == null || n === '') return '';
    if (n === 0) return '$0';
    if (n < 0) return '-$' + Math.round(Math.abs(n)).toLocaleString('en-US');
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  window.fmtNum = function (n) {
    if (n == null || n === '') return '';
    return Number(n).toLocaleString('en-US');
  };
})();
