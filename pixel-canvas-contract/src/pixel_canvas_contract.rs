#![no_std]

#[allow(unused_imports)]
use multiversx_sc::imports::*;
use multiversx_sc::derive_imports::*;

// ─── Tier thresholds (in smallest EGLD units = 10^18) ─────────────────────────
const EGLD_UNIT: u64 = 1_000_000_000_000_000_000u64;

const TIER_NOVICE: u64     =   50_000_000_000_000_000u64; // 0.05  xEGLD
const TIER_APPRENTICE: u64 =  250_000_000_000_000_000u64; // 0.25  xEGLD
const TIER_ARTISAN: u64    =  500_000_000_000_000_000u64; // 0.50  xEGLD
const TIER_MASTER: u64     = 1_250_000_000_000_000_000u64; // 1.25 xEGLD
const TIER_LEGEND: u64     = 2_500_000_000_000_000_000u64; // 2.50 xEGLD

const BASE_PIXELS_PER_EGLD: u64 = 20_000u64;

// Each pixel painted: (x, y, color) — u32 each, 12 bytes fixed-size in ManagedVec.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, ManagedVecItem, Clone)]
pub struct PixelData {
    pub x: u32,
    pub y: u32,
    pub color: u32,
}

#[multiversx_sc::contract]
pub trait PixelCanvasContract {

    // ─── Init / Upgrade ───────────────────────────────────────────────────────

    #[init]
    fn init(&self) {
        let deployer = self.blockchain().get_caller();
        self.charity_address().set(&deployer);
        self.total_donated().set(BigUint::zero());
        self.total_pixel_for_charity().set(BigUint::zero());
    }

    #[upgrade]
    fn upgrade(&self) {}

    // ─── Owner configuration ──────────────────────────────────────────────────

    /// Call once after creating the PIXEL ESDT token.
    /// denomination = smallest token units per 1 pixel:
    ///   0-decimal token  → denomination = 1
    ///   18-decimal token → denomination = 1_000_000_000_000_000_000
    #[endpoint(setPixelToken)]
    fn set_pixel_token(&self, token_id: TokenIdentifier, denomination: BigUint) {
        self.require_owner();
        require!(token_id.is_valid_esdt_identifier(), "Invalid token identifier");
        require!(denomination > BigUint::zero(), "Denomination must be > 0");
        self.pixel_token_id().set(&token_id);
        self.pixel_denomination().set(&denomination);
    }

    #[endpoint(setCharityAddress)]
    fn set_charity_address_endpoint(&self, new_address: ManagedAddress) {
        self.require_owner();
        self.charity_address().set(&new_address);
    }

    // ─── Buy PIXEL tokens with EGLD ───────────────────────────────────────────

    #[payable("EGLD")]
    #[endpoint(buyPixels)]
    fn buy_pixels(&self) {
        require!(!self.pixel_token_id().is_empty(), "PIXEL token not configured");

        let payment = self.call_value().egld().clone_value();
        require!(
            payment >= BigUint::from(TIER_NOVICE),
            "Payment too low. Minimum is 0.05 xEGLD."
        );

        let pixel_count = self.calculate_pixels(&payment);
        let denomination = self.pixel_denomination().get();
        let token_amount = &pixel_count * &denomination;
        let token_id = self.pixel_token_id().get();
        let caller = self.blockchain().get_caller();

        // Send PIXEL tokens from the contract's balance to the buyer.
        self.send().direct_esdt(&caller, &token_id, 0, &token_amount);

        // Distribute EGLD: 50% owner, 50% charity.
        self.distribute_egld(&payment);

        self.buy_pixels_event(&caller, &payment, &token_amount);
    }

    // ─── Paint pixels (user sends PIXEL tokens) ───────────────────────────────

    #[payable("*")]
    #[endpoint(paintPixels)]
    fn paint_pixels(&self, pixels: ManagedVec<PixelData>) {
        require!(!self.pixel_token_id().is_empty(), "PIXEL token not configured");
        require!(!pixels.is_empty(), "No pixels provided");

        let token_id = self.pixel_token_id().get();
        let payment = self.call_value().single_esdt();
        require!(
            payment.token_identifier == token_id,
            "Must pay with PIXEL tokens"
        );

        let caller = self.blockchain().get_caller();
        let denomination = self.pixel_denomination().get();
        let len = pixels.len();

        // First pass: calculate required payment.
        let mut required = BigUint::zero();
        for i in 0..len {
            let pixel = pixels.get(i);
            let owner_mapper = self.pixel_owner(pixel.x, pixel.y);
            let current_owner = if owner_mapper.is_empty() {
                ManagedAddress::zero()
            } else {
                owner_mapper.get()
            };
            if current_owner.is_zero() || current_owner == caller {
                // Unowned or own pixel: 1 denomination unit.
                required += &denomination;
            } else {
                // Someone else's pixel: 2 units (1 royalty + 1 for charity).
                required += &denomination;
                required += &denomination;
            }
        }
        require!(payment.amount >= required, "Insufficient PIXEL tokens");

        // Second pass: send royalties and record new ownership.
        let mut royalty_total = BigUint::zero();
        for i in 0..len {
            let pixel = pixels.get(i);
            let owner_mapper = self.pixel_owner(pixel.x, pixel.y);
            let current_owner = if owner_mapper.is_empty() {
                ManagedAddress::zero()
            } else {
                owner_mapper.get()
            };
            if !current_owner.is_zero() && current_owner != caller {
                // Send 1 denomination unit to the previous owner as royalty.
                self.send().direct_esdt(&current_owner, &token_id, 0, &denomination);
                royalty_total += &denomination;
            }
            self.pixel_owner(pixel.x, pixel.y).set(&caller);
        }

        // Refund any overpayment.
        if payment.amount > required {
            let refund = &payment.amount - &required;
            self.send().direct_esdt(&caller, &token_id, 0, &refund);
        }

        // Accumulate the remaining PIXEL for end-of-epoch charity distribution.
        // = total received (capped at required) minus royalties already sent out.
        let for_charity = required - royalty_total;
        self.total_pixel_for_charity()
            .update(|total| *total += &for_charity);

        self.paint_pixels_event(&caller, len as u32);
    }

    // ─── Epoch end: flush accumulated PIXEL to charity ───────────────────────

    #[endpoint(distributePixelToCharity)]
    fn distribute_pixel_to_charity(&self) {
        self.require_owner();
        require!(!self.pixel_token_id().is_empty(), "PIXEL token not configured");

        let total = self.total_pixel_for_charity().get();
        require!(total > BigUint::zero(), "No PIXEL accumulated");

        let token_id = self.pixel_token_id().get();
        let charity_addr = self.charity_address().get();
        self.send().direct_esdt(&charity_addr, &token_id, 0, &total);
        self.total_pixel_for_charity().set(BigUint::zero());
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    #[view(getPixelOwner)]
    fn get_pixel_owner(&self, x: u32, y: u32) -> OptionalValue<ManagedAddress> {
        let mapper = self.pixel_owner(x, y);
        if mapper.is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(mapper.get())
        }
    }

    #[view(getPixelTokenId)]
    fn get_pixel_token_id(&self) -> TokenIdentifier {
        self.pixel_token_id().get()
    }

    #[view(getPixelDenomination)]
    fn get_pixel_denomination(&self) -> BigUint {
        self.pixel_denomination().get()
    }

    #[view(getTotalPixelForCharity)]
    fn get_total_pixel_for_charity(&self) -> BigUint {
        self.total_pixel_for_charity().get()
    }

    #[view(getCharityAddress)]
    fn get_charity_address(&self) -> ManagedAddress {
        self.charity_address().get()
    }

    #[view(getTotalDonated)]
    fn get_total_donated(&self) -> BigUint {
        self.total_donated().get()
    }

    // ─── Storage mappers ──────────────────────────────────────────────────────

    #[storage_mapper("pixelTokenId")]
    fn pixel_token_id(&self) -> SingleValueMapper<TokenIdentifier>;

    #[storage_mapper("pixelDenomination")]
    fn pixel_denomination(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("pixelOwner")]
    fn pixel_owner(&self, x: u32, y: u32) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("totalPixelForCharity")]
    fn total_pixel_for_charity(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("charityAddress")]
    fn charity_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("totalDonated")]
    fn total_donated(&self) -> SingleValueMapper<BigUint>;

    // ─── Events ───────────────────────────────────────────────────────────────

    #[event("buyPixels")]
    fn buy_pixels_event(
        &self,
        #[indexed] buyer: &ManagedAddress,
        #[indexed] egld_paid: &BigUint,
        #[indexed] pixel_tokens_received: &BigUint,
    );

    #[event("paintPixels")]
    fn paint_pixels_event(
        &self,
        #[indexed] painter: &ManagedAddress,
        #[indexed] pixel_count: u32,
    );

    // ─── Internal helpers ─────────────────────────────────────────────────────

    fn calculate_pixels(&self, payment: &BigUint) -> BigUint {
        let one_egld = BigUint::from(EGLD_UNIT);
        let base = payment * BASE_PIXELS_PER_EGLD / &one_egld;

        if payment >= &BigUint::from(TIER_LEGEND) {
            &base * 150u64 / 100u64
        } else if payment >= &BigUint::from(TIER_MASTER) {
            &base * 130u64 / 100u64
        } else if payment >= &BigUint::from(TIER_ARTISAN) {
            &base * 120u64 / 100u64
        } else if payment >= &BigUint::from(TIER_APPRENTICE) {
            &base * 110u64 / 100u64
        } else {
            base
        }
    }

    fn distribute_egld(&self, amount: &BigUint) {
        // 50% to owner, 50% to charity (remainder goes to charity on odd amounts).
        let owner_half = amount / 2u64;
        let charity_half = amount - &owner_half;

        let owner_addr = self.blockchain().get_owner_address();
        self.send().direct_egld(&owner_addr, &owner_half);

        let charity_addr = self.charity_address().get();
        self.send().direct_egld(&charity_addr, &charity_half);

        self.total_donated()
            .update(|total| *total += &charity_half);
    }

    fn require_owner(&self) {
        let caller = self.blockchain().get_caller();
        let owner = self.blockchain().get_owner_address();
        require!(caller == owner, "Only the contract owner can call this.");
    }
}
