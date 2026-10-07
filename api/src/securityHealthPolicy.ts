/** Assess only measured checks; no automatic repair or full-escrow claim. */
export function securityHealthIssues(report:Record<string,any>):string[]{
 const issues:string[]=[];
 if(report.ledgerMismatches>0)issues.push('gold-ledger-mismatch');
 if(report.snapshots?.hashMismatches>0)issues.push('snapshot-hash-mismatch');
 if(report.rawCredentials?.sessions>0||report.rawCredentials?.tickets>0)issues.push('unhashed-credentials');
 if(report.stakes?.unverified>0)issues.push('unverified-staked-ownership');
 for(const [label,journal] of Object.entries(report.pendingReceiptCounts??{}) as [string,any][]){
  if(journal.malformed>0)issues.push('malformed-'+label+'-journal');
 }
 if(report.availableDiskBytes!==undefined&&BigInt(report.availableDiskBytes)<500n*1024n*1024n)issues.push('low-disk-space');
 return issues;
}
