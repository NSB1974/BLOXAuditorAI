// Locate the error handling block and add a debug log for the specific code
console.error("Audit request failed:", t);
let e = "An unexpected error occurred while fetching the audit. Please try again.";

if (t?.code === "PAYMENT_CONFIG_MISSING") {
    // Log internal details for developers while showing a polite message to users
    console.warn("Dev Alert: The server is missing base payment configurations (ENV variables).");
    e = "Payment is temporarily unavailable. Please contact support.";
} else if (t?.code === "WALLET_NOT_FOUND" || t?.code === "WRONG_NETWORK" || t?.code === "PAYMENT_NOT_CONFIRMED") {
    e = t.message;
} else if (t instanceof TypeError) {
    e = "Could not reach the server. In Chrome, disable ad-block/privacy extensions for this site, then hard refresh and try again.";
}

x(e);
