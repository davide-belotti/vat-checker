// ─── Console output helpers ─────────────────────────────────

function printLookupResult({ service, label, registered, vatNumber, name, address, country, reason }) {
  const heading = label ? `${service} Result (${label})` : `${service} Result`;
  console.log(`  ${heading}`);
  console.log(`  ${"-".repeat(heading.length)}`);
  console.log(`  Registered:  ${registered ? "Yes" : "No"}`);
  console.log(`  VAT Number:  ${vatNumber}`);
  if (reason) {
    console.log(`  Reason:      ${reason}`);
  } else {
    console.log(`  Name:        ${name}`);
    console.log(`  Address:     ${address}`);
    console.log(`  Country:     ${country}`);
  }
  console.log();
}

function printChecksumResult(cc, num, result) {
  console.log(`\n  Validation`);
  console.log(`  ----------`);
  console.log(`  VAT Number:  ${cc}${num}`);
  console.log(`  Format:      ${result.formatValid ? "Valid" : "Invalid — " + result.error}`);
  if (result.formatValid) {
    if (result.formatOnly) {
      console.log(`  Checksum:    N/A (format-only check for ${cc})`);
    } else {
      console.log(`  Checksum:    ${result.valid ? "Pass" : "Fail"}`);
    }
  }
  console.log();
}

export { printLookupResult, printChecksumResult };
