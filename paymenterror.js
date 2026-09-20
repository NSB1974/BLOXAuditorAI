// Ensure the backend sends the 'PAYMENT_CONFIG_MISSING' code 
// to trigger the user-friendly message below.
console.error("Audit request failed:", t);
let e = "An unexpected error occurred while fetching the audit. Please try again.";

const errorCode = t?.code;
const errorMsg = t?.message;

if (["WALLET_NOT_FOUND", "WRONG_NETWORK", "PAYMENT_NOT_CONFIRMED"].includes(errorCode)) {
    e = errorMsg;
} else if (errorCode === "PAYMENT_CONFIG_MISSING") {
    // This matches the error you are seeing
    e = "Payment is temporarily unavailable. Please contact support.";
} else if (t instanceof TypeError) {
    e = "Could not reach the server. In Chrome, disable ad-block/privacy extensions for this site, then hard refresh and try again.";
}

x(e);
