#![no_std]

#[allow(unused_imports)]
use multiversx_sc::imports::*;
use multiversx_sc::derive_imports::*;

// Tier thresholds (in smallest EGLD units = 10^18)
const EGLD_UNIT: u64 = 1_000_000_000_000_000_000u64;

const TIER_NOVICE: u64     =   50_000_000_000_000_000u64; // 0.05  xEGLD
const TIER_APPRENTICE: u64 =  250_000_000_000_000_000u64; // 0.25  xEGLD
const TIER_ARTISAN: u64    =  500_000_000_000_000_000u64; // 0.50  xEGLD
const TIER_MASTER: u64     = 1_250_000_000_000_000_000u64; // 1.25 xEGLD
const TIER_LEGEND: u64     = 2_500_000_000_000_000_000u64; // 2.50 xEGLD

const BASE_PIXELS_PER_EGLD: u64 = 20_000u64;
const DEFAULT_EPOCH_DURATION: u64 = 86_400u64; // 24 hours in seconds

// Auction constants
const AUCTION_SIZE: u32 = 20;                  // 20×20 pixel zone
const DEFAULT_AUCTION_DURATION: u64 = 300u64;  // 5 min default; configurable via setAuctionDuration

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

    // Init / Upgrade
    #[init]
    fn init(&self) {
        let deployer = self.blockchain().get_caller();
        self.charity_address().set(&deployer);
        self.total_donated().set(BigUint::zero());
        self.total_pixel_for_charity().set(BigUint::zero());
        self.total_egld_for_charity().set(BigUint::zero());
        self.current_epoch().set(0u64);
        self.epoch_duration_seconds().set(DEFAULT_EPOCH_DURATION);
        self.epoch_top_paint_count().set(0u64);
        self.auction_duration_seconds().set(DEFAULT_AUCTION_DURATION);
    }

    #[upgrade]
    fn upgrade(&self) {
        // Backfill auction duration for contracts deployed before this storage existed.
        if self.auction_duration_seconds().is_empty() {
            self.auction_duration_seconds().set(DEFAULT_AUCTION_DURATION);
        }
    }

    // Owner configuration
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

    #[endpoint(setEpochDuration)]
    fn set_epoch_duration(&self, seconds: u64) {
        self.require_owner();
        require!(seconds > 0u64, "Duration must be > 0");
        self.epoch_duration_seconds().set(seconds);
    }

    #[endpoint(setAuctionDuration)]
    fn set_auction_duration(&self, seconds: u64) {
        self.require_owner();
        require!(seconds > 0u64, "Duration must be > 0");
        self.auction_duration_seconds().set(seconds);
    }

    /// Set the candidate charities for the upcoming (or current) epoch.
    /// `names` and `addrs` must have the same length (max 5).
    #[endpoint(setEpochCharities)]
    fn set_epoch_charities(
        &self,
        epoch: u64,
        names: ManagedVec<ManagedBuffer>,
        addrs: ManagedVec<ManagedAddress>,
    ) {
        self.require_owner();
        require!(names.len() == addrs.len(), "Names and addresses length mismatch");
        require!(names.len() <= 5, "Max 5 charities per epoch");
        require!(epoch > 0u64, "Epoch must be > 0");

        // Clear previous data for this epoch
        self.epoch_charity_names(epoch).clear();
        self.epoch_charity_addrs(epoch).clear();
        self.epoch_vote_counts(epoch).clear();

        for i in 0..names.len() {
            self.epoch_charity_names(epoch).push(&names.get(i));
            self.epoch_charity_addrs(epoch).push(&addrs.get(i));
            self.epoch_vote_counts(epoch).push(&0u64);
        }
    }

    // NFT collection configuration
    #[endpoint(setNftCollection)]
    fn set_nft_collection(&self, token_id: TokenIdentifier) {
        self.require_owner();
        require!(token_id.is_valid_esdt_identifier(), "Invalid token identifier");
        self.nft_collection_id().set(&token_id);
    }

    // Charity voting
    /// Cast a vote for a charity in the current epoch. One vote per wallet.
    #[endpoint(vote)]
    fn vote(&self, charity_index: u32) {
        let epoch = self.current_epoch().get();
        require!(epoch > 0u64, "No active epoch");

        let caller = self.blockchain().get_caller();
        require!(
            !self.epoch_has_voted(epoch, &caller).get(),
            "Already voted this epoch"
        );

        let count = self.epoch_charity_names(epoch).len() as u32;
        require!(count > 0, "No charities set for this epoch");
        require!(charity_index < count, "Invalid charity index");

        let idx = (charity_index + 1) as usize; // VecMapper is 1-indexed
        self.epoch_vote_counts(epoch).set(idx, &(self.epoch_vote_counts(epoch).get(idx) + 1u64));
        self.epoch_voter_choice(epoch, &caller).set(charity_index);
        self.epoch_has_voted(epoch, &caller).set(true);

        self.vote_cast_event(epoch, &caller, charity_index);
    }

    // Epoch management
    /// Start a new epoch. Increments epoch counter, records start timestamp,
    /// resets top-painter tracking.
    #[endpoint(startEpoch)]
    fn start_epoch(&self) {
        self.require_owner();
        self.start_epoch_internal();
    }

    /// Start a new epoch AND open a 24h auction for the given 20×20 zone.
    #[endpoint(startEpochWithAuction)]
    fn start_epoch_with_auction(&self, section_x: u32, section_y: u32) {
        self.require_owner();
        require!(
            section_x + AUCTION_SIZE <= 100u32,
            "Auction zone exceeds canvas width"
        );
        require!(
            section_y + AUCTION_SIZE <= 100u32,
            "Auction zone exceeds canvas height"
        );

        let new_epoch = self.start_epoch_internal();
        let duration = self.auction_duration_seconds().get();
        require!(duration > 0u64, "Auction duration must be > 0");
        let end_ts = self.blockchain().get_block_timestamp() + duration;

        // Defensive clears so the new epoch never inherits stale auction state.
        self.auction_highest_bid(new_epoch).clear();
        self.auction_highest_bidder(new_epoch).clear();
        self.zone_unlocked_for(new_epoch).clear();

        self.auction_section_x(new_epoch).set(section_x);
        self.auction_section_y(new_epoch).set(section_y);
        self.auction_active(new_epoch).set(true);
        self.auction_end_timestamp(new_epoch).set(end_ts);

        self.auction_started_event(new_epoch, section_x, section_y, end_ts);
    }

    /// End the current epoch: send accumulated PIXEL to the default charity and
    /// EGLD to the vote-winning charity, then mint the epoch NFTs. The optional
    /// painter/auction/ai URIs are the NFT images (hex-encoded by the admin UI).
    #[allow_multiple_var_args]
    #[endpoint(endEpoch)]
    fn end_epoch(
        &self,
        painter_uri: OptionalValue<ManagedBuffer>,
        auction_uri: OptionalValue<ManagedBuffer>,
        ai_uri: OptionalValue<ManagedBuffer>,
    ) {
        self.require_owner();
        let epoch = self.current_epoch().get();
        require!(epoch > 0u64, "No active epoch to end");
        // Guard against double-minting: an epoch can only be ended once.
        require!(!self.epoch_ended(epoch).get(), "Epoch already ended");

        // Flush accumulated PIXEL to default charity address
        if !self.pixel_token_id().is_empty() {
            let total = self.total_pixel_for_charity().get();
            if total > BigUint::zero() {
                let token_id = self.pixel_token_id().get();
                let charity_addr = self.charity_address().get();
                self.send().direct_esdt(&charity_addr, &token_id, 0, &total);
                self.total_pixel_for_charity().set(BigUint::zero());
            }
        }

        // Distribute accumulated EGLD to the winning charity
        let egld_total = self.total_egld_for_charity().get();
        if egld_total > BigUint::zero() {
            let winning_addr = self.find_winning_charity(epoch);
            self.send().direct_egld(&winning_addr, &egld_total);
            self.total_donated().update(|t| *t += &egld_total);
            self.total_egld_for_charity().set(BigUint::zero());
        }

        let top_painter = if self.epoch_top_painter().is_empty() {
            ManagedAddress::zero()
        } else {
            self.epoch_top_painter().get()
        };
        let top_count = self.epoch_top_paint_count().get();

        self.epoch_ended_event(epoch, &top_painter, top_count);

        self.epoch_top_painter_history(epoch).set(&top_painter);

        // Mint the epoch NFTs if a collection is configured.
        if !self.nft_collection_id().is_empty() {
            let token_id = self.nft_collection_id().get();
            let royalties = BigUint::zero();
            let hash = ManagedBuffer::new();
            let amount = BigUint::from(1u64);

            // Build separate URI lists — painter NFT gets the full canvas image,
            // auction-winner NFT gets only their 20×20 zone image.
            let mut painter_uris: ManagedVec<ManagedBuffer> = ManagedVec::new();
            if let OptionalValue::Some(uri) = painter_uri {
                if uri.len() > 0 {
                    painter_uris.push(uri);
                }
            }
            let mut auction_uris: ManagedVec<ManagedBuffer> = ManagedVec::new();
            if let OptionalValue::Some(uri) = auction_uri {
                if uri.len() > 0 {
                    auction_uris.push(uri);
                }
            }
            // AI NFT URI — points at the server-rendered AI reinterpretation
            // of the full canvas. Skipped (no AI NFT minted) if empty.
            let mut ai_uris: ManagedVec<ManagedBuffer> = ManagedVec::new();
            if let OptionalValue::Some(uri) = ai_uri {
                if uri.len() > 0 {
                    ai_uris.push(uri);
                }
            }

            // Mint NFT for top painter (full-canvas image)
            if !top_painter.is_zero() {
                let name = sc_format!("Painter of Epoch {}", epoch);
                let attributes = sc_format!(
                    "epoch:{};type:painter;pixels:{}",
                    epoch,
                    top_count
                );
                let nft_nonce = self.send().esdt_nft_create(
                    &token_id,
                    &amount,
                    &name,
                    &royalties,
                    &hash,
                    &attributes,
                    &painter_uris,
                );
                self.send().direct_esdt(&top_painter, &token_id, nft_nonce, &amount);
            }

            // AI Vision NFT — the AI reinterpretation, minted to the same top
            // painter. Skipped if there's no ai_uri or no top painter.
            if !top_painter.is_zero() && !ai_uris.is_empty() {
                let name = sc_format!("AI Vision of Epoch {}", epoch);
                let attributes = sc_format!(
                    "epoch:{};type:ai;source:gpt-image-1",
                    epoch
                );
                let nft_nonce = self.send().esdt_nft_create(
                    &token_id,
                    &amount,
                    &name,
                    &royalties,
                    &hash,
                    &attributes,
                    &ai_uris,
                );
                self.send().direct_esdt(&top_painter, &token_id, nft_nonce, &amount);
            }

            // Mint NFT for auction zone winner (cropped 20×20 zone image)
            let auction_winner = if self.zone_unlocked_for(epoch).is_empty() {
                ManagedAddress::zero()
            } else {
                self.zone_unlocked_for(epoch).get()
            };
            if !auction_winner.is_zero() {
                let sx = self.auction_section_x(epoch).get();
                let sy = self.auction_section_y(epoch).get();
                let name = sc_format!("Auction Winner Epoch {}", epoch);
                let attributes = sc_format!(
                    "epoch:{};type:auction;section:{},{}",
                    epoch,
                    sx,
                    sy
                );
                let nft_nonce = self.send().esdt_nft_create(
                    &token_id,
                    &amount,
                    &name,
                    &royalties,
                    &hash,
                    &attributes,
                    &auction_uris,
                );
                self.send().direct_esdt(&auction_winner, &token_id, nft_nonce, &amount);
            }
        }

        // Mark the epoch ended so further endEpoch calls are rejected.
        self.epoch_ended(epoch).set(true);

        // Force-close the auction if it was still flagged active.
        if self.auction_active(epoch).get() {
            self.auction_active(epoch).set(false);
        }

        // Reset epoch-scoped painter accumulators for the next epoch.
        self.epoch_top_painter().clear();
        self.epoch_top_paint_count().set(0u64);

        // epoch_duration_seconds is intentionally NOT touched here; "ended" is
        // tracked by the per-epoch isEpochEnded(epoch) view instead.
    }

    // Auction endpoints
    /// Place a bid in the current epoch's auction.
    #[payable("EGLD")]
    #[endpoint(placeBid)]
    fn place_bid(&self) {
        let epoch = self.current_epoch().get();
        require!(epoch > 0u64, "No active epoch");
        // is_auction_live = flag set AND not past the end timestamp (one rule
        // shared with the read path and the paintPixels zone check).
        require!(self.is_auction_live(epoch), "Auction is not live");

        let payment = self.call_value().egld().clone_value();
        require!(payment > BigUint::zero(), "Bid must be > 0");

        let caller = self.blockchain().get_caller();

        // Bids accumulate per caller.
        self.auction_bid(epoch, &caller).update(|b| *b += &payment);
        let new_total = self.auction_bid(epoch, &caller).get();

        if !self.auction_has_bid(epoch, &caller).get() {
            self.auction_has_bid(epoch, &caller).set(true);
            self.auction_bidders(epoch).push(&caller);
        }

        let current_highest = self.auction_highest_bid(epoch).get();
        if new_total > current_highest {
            self.auction_highest_bid(epoch).set(&new_total);
            self.auction_highest_bidder(epoch).set(&caller);
        }

        self.bid_placed_event(epoch, &caller, &payment, &new_total);
    }

    /// Withdraw a non-winning bid (or any bid once auction is closed).
    #[endpoint(withdrawBid)]
    fn withdraw_bid(&self) {
        let epoch = self.current_epoch().get();
        require!(epoch > 0u64, "No active epoch");

        let caller = self.blockchain().get_caller();

        // The highest bidder can't withdraw while the auction is still active.
        if self.auction_active(epoch).get() {
            let now = self.blockchain().get_block_timestamp();
            let end_ts = self.auction_end_timestamp(epoch).get();
            if now < end_ts && !self.auction_highest_bidder(epoch).is_empty() {
                let highest = self.auction_highest_bidder(epoch).get();
                require!(caller != highest, "Highest bidder cannot withdraw during active auction");
            }
        }

        let bid = self.auction_bid(epoch, &caller).get();
        require!(bid > BigUint::zero(), "No bid to withdraw");

        self.auction_bid(epoch, &caller).set(BigUint::zero());
        self.send().direct_egld(&caller, &bid);
    }

    /// Close the current epoch's auction (owner only): set the winner and commit
    /// the winning bid to the charity accumulator. Owner may close at any time
    /// while the flag is set; expiry is handled separately by is_auction_live.
    #[endpoint(closeAuction)]
    fn close_auction(&self) {
        self.require_owner();
        let epoch = self.current_epoch().get();
        require!(epoch > 0u64, "No active epoch");
        // Reject closing an already-closed auction so the bid isn't distributed twice.
        require!(self.auction_active(epoch).get(), "Auction is not active");

        self.auction_active(epoch).set(false);

        if !self.auction_highest_bidder(epoch).is_empty() {
            let winner = self.auction_highest_bidder(epoch).get();
            let winning_bid = self.auction_highest_bid(epoch).get();

            self.zone_unlocked_for(epoch).set(&winner);

            // EGLD stays in the contract until endEpoch sends it to the charity.
            self.total_egld_for_charity().update(|t| *t += &winning_bid);

            // Clear the winner's bid so they can't also withdrawBid.
            self.auction_bid(epoch, &winner).set(BigUint::zero());

            self.auction_closed_event(epoch, &winner, &winning_bid);
        } else {
            // No bids: zone_unlocked_for stays unset, which downstream treats
            // as "no winner / unrestricted zone".
            self.auction_closed_event(epoch, &ManagedAddress::zero(), &BigUint::zero());
        }
    }

    // Buy PIXEL tokens with EGLD
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

        self.send().direct_esdt(&caller, &token_id, 0, &token_amount);
        self.distribute_egld(&payment);
        self.buy_pixels_event(&caller, &payment, &token_amount);
    }

    // Paint pixels (user sends PIXEL tokens)
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

        // Auction zone gate: a live auction locks the zone; after it closes,
        // only the winner may paint there. Uses is_auction_live so an expired
        // auction stops blocking immediately.
        let epoch = self.current_epoch().get();
        if epoch > 0u64 {
            let zone_x = self.auction_section_x(epoch).get();
            let zone_y = self.auction_section_y(epoch).get();
            let auction_live = self.is_auction_live(epoch);
            let winner = if self.zone_unlocked_for(epoch).is_empty() {
                ManagedAddress::zero()
            } else {
                self.zone_unlocked_for(epoch).get()
            };

            let len = pixels.len();
            for i in 0..len {
                let pixel = pixels.get(i);
                let in_zone = pixel.x >= zone_x
                    && pixel.x < zone_x + AUCTION_SIZE
                    && pixel.y >= zone_y
                    && pixel.y < zone_y + AUCTION_SIZE;
                if in_zone {
                    if auction_live {
                        require!(false, "Zone is locked during active auction");
                    } else if !winner.is_zero() && caller != winner {
                        require!(false, "This zone is reserved for the auction winner");
                    }
                }
            }
        }

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
                required += &denomination;
            } else {
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

        // Accumulate PIXEL for charity.
        let for_charity = required - royalty_total;
        self.total_pixel_for_charity()
            .update(|total| *total += &for_charity);

        // Track painter count for epoch leaderboard.
        self.record_paint(&caller, len as u64);

        self.paint_pixels_event(&caller, len as u32);
    }

    // Distribute PIXEL to charity (manual, kept for backward compat)
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

    // Views
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

    // Epoch views
    #[view(getCurrentEpoch)]
    fn get_current_epoch(&self) -> u64 {
        self.current_epoch().get()
    }

    #[view(getEpochStartTimestamp)]
    fn get_epoch_start_timestamp(&self) -> u64 {
        self.epoch_start_timestamp().get()
    }

    #[view(getEpochDuration)]
    fn get_epoch_duration(&self) -> u64 {
        self.epoch_duration_seconds().get()
    }

    #[view(getAuctionDurationSeconds)]
    fn get_auction_duration_seconds(&self) -> u64 {
        self.auction_duration_seconds().get()
    }

    /// Returns the top painter's address and pixel count for the current epoch.
    #[view(getEpochTopPainter)]
    fn get_epoch_top_painter(&self) -> MultiValue2<ManagedAddress, u64> {
        let painter = if self.epoch_top_painter().is_empty() {
            ManagedAddress::zero()
        } else {
            self.epoch_top_painter().get()
        };
        (painter, self.epoch_top_paint_count().get()).into()
    }

    #[view(getEpochPixelCount)]
    fn get_epoch_pixel_count(&self, epoch: u64, painter: ManagedAddress) -> u64 {
        self.epoch_pixel_count(epoch, &painter).get()
    }

    // Charity voting views
    /// Returns (names, addresses) for charities registered in `epoch`.
    #[view(getEpochCharities)]
    fn get_epoch_charities(
        &self,
        epoch: u64,
    ) -> MultiValue2<ManagedVec<ManagedBuffer>, ManagedVec<ManagedAddress>> {
        let len = self.epoch_charity_names(epoch).len();
        let mut names: ManagedVec<ManagedBuffer> = ManagedVec::new();
        let mut addrs: ManagedVec<ManagedAddress> = ManagedVec::new();
        for i in 1..=len {
            names.push(self.epoch_charity_names(epoch).get(i));
            addrs.push(self.epoch_charity_addrs(epoch).get(i));
        }
        (names, addrs).into()
    }

    /// Returns vote counts per charity for `epoch` (parallel to getEpochCharities).
    #[view(getVoteTallies)]
    fn get_vote_tallies(&self, epoch: u64) -> ManagedVec<u64> {
        let len = self.epoch_vote_counts(epoch).len();
        let mut out: ManagedVec<u64> = ManagedVec::new();
        for i in 1..=len {
            out.push(self.epoch_vote_counts(epoch).get(i));
        }
        out
    }

    /// Returns the charity index the caller voted for, or 255 if not voted.
    #[view(getMyVote)]
    fn get_my_vote(&self, epoch: u64, voter: ManagedAddress) -> u32 {
        if !self.epoch_has_voted(epoch, &voter).get() {
            return 255u32;
        }
        self.epoch_voter_choice(epoch, &voter).get()
    }

    #[view(getTotalEgldForCharity)]
    fn get_total_egld_for_charity(&self) -> BigUint {
        self.total_egld_for_charity().get()
    }

    // Auction views
    /// Returns full auction state for the given epoch.
    #[view(getAuctionState)]
    fn get_auction_state(
        &self,
        epoch: u64,
    ) -> MultiValue7<bool, u32, u32, u64, ManagedAddress, BigUint, ManagedAddress> {
        let active = self.auction_active(epoch).get();
        let x = self.auction_section_x(epoch).get();
        let y = self.auction_section_y(epoch).get();
        let end_ts = self.auction_end_timestamp(epoch).get();
        let highest_bidder = if self.auction_highest_bidder(epoch).is_empty() {
            ManagedAddress::zero()
        } else {
            self.auction_highest_bidder(epoch).get()
        };
        let highest_bid = self.auction_highest_bid(epoch).get();
        let winner = if self.zone_unlocked_for(epoch).is_empty() {
            ManagedAddress::zero()
        } else {
            self.zone_unlocked_for(epoch).get()
        };
        (active, x, y, end_ts, highest_bidder, highest_bid, winner).into()
    }

    /// Returns a specific address's total bid for the given epoch.
    #[view(getMyBid)]
    fn get_my_bid(&self, epoch: u64, addr: ManagedAddress) -> BigUint {
        self.auction_bid(epoch, &addr).get()
    }

    /// Returns the NFT collection token identifier.
    #[view(getNftCollectionId)]
    fn get_nft_collection_id(&self) -> OptionalValue<TokenIdentifier> {
        if self.nft_collection_id().is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(self.nft_collection_id().get())
        }
    }

    /// Whether the auction flag is set (ignores expiry — use isAuctionLive for
    /// "currently accepting bids").
    #[view(isAuctionActive)]
    fn is_auction_active(&self, epoch: u64) -> bool {
        self.auction_active(epoch).get()
    }

    /// True iff the auction is flagged active AND not past its end timestamp.
    /// Single source of truth shared by placeBid, the zone gate, and the UI.
    #[view(isAuctionLive)]
    fn is_auction_live(&self, epoch: u64) -> bool {
        if !self.auction_active(epoch).get() {
            return false;
        }
        self.blockchain().get_block_timestamp() < self.auction_end_timestamp(epoch).get()
    }

    /// Whether endEpoch has already run for this epoch (lets the UI pre-check).
    #[view(isEpochEnded)]
    fn is_epoch_ended_view(&self, epoch: u64) -> bool {
        self.epoch_ended(epoch).get()
    }

    // Storage mappers
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

    #[storage_mapper("totalEgldForCharity")]
    fn total_egld_for_charity(&self) -> SingleValueMapper<BigUint>;

    // Epoch storage
    #[storage_mapper("currentEpoch")]
    fn current_epoch(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("epochStartTimestamp")]
    fn epoch_start_timestamp(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("epochDurationSeconds")]
    fn epoch_duration_seconds(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("auctionDurationSeconds")]
    fn auction_duration_seconds(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("epochPixelCount")]
    fn epoch_pixel_count(&self, epoch: u64, painter: &ManagedAddress) -> SingleValueMapper<u64>;

    #[storage_mapper("epochTopPainter")]
    fn epoch_top_painter(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("epochTopPaintCount")]
    fn epoch_top_paint_count(&self) -> SingleValueMapper<u64>;

    // Charity voting storage
    #[storage_mapper("epochCharityNames")]
    fn epoch_charity_names(&self, epoch: u64) -> VecMapper<ManagedBuffer>;

    #[storage_mapper("epochCharityAddrs")]
    fn epoch_charity_addrs(&self, epoch: u64) -> VecMapper<ManagedAddress>;

    #[storage_mapper("epochVoteCounts")]
    fn epoch_vote_counts(&self, epoch: u64) -> VecMapper<u64>;

    #[storage_mapper("epochHasVoted")]
    fn epoch_has_voted(&self, epoch: u64, voter: &ManagedAddress) -> SingleValueMapper<bool>;

    #[storage_mapper("epochVoterChoice")]
    fn epoch_voter_choice(&self, epoch: u64, voter: &ManagedAddress) -> SingleValueMapper<u32>;

    // Auction storage
    #[storage_mapper("auctionSectionX")]
    fn auction_section_x(&self, epoch: u64) -> SingleValueMapper<u32>;

    #[storage_mapper("auctionSectionY")]
    fn auction_section_y(&self, epoch: u64) -> SingleValueMapper<u32>;

    #[storage_mapper("auctionActive")]
    fn auction_active(&self, epoch: u64) -> SingleValueMapper<bool>;

    #[storage_mapper("auctionEndTimestamp")]
    fn auction_end_timestamp(&self, epoch: u64) -> SingleValueMapper<u64>;

    #[storage_mapper("auctionBid")]
    fn auction_bid(&self, epoch: u64, addr: &ManagedAddress) -> SingleValueMapper<BigUint>;

    #[storage_mapper("auctionBidders")]
    fn auction_bidders(&self, epoch: u64) -> VecMapper<ManagedAddress>;

    #[storage_mapper("auctionHasBid")]
    fn auction_has_bid(&self, epoch: u64, addr: &ManagedAddress) -> SingleValueMapper<bool>;

    #[storage_mapper("auctionHighestBidder")]
    fn auction_highest_bidder(&self, epoch: u64) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("auctionHighestBid")]
    fn auction_highest_bid(&self, epoch: u64) -> SingleValueMapper<BigUint>;

    #[storage_mapper("zoneUnlockedFor")]
    fn zone_unlocked_for(&self, epoch: u64) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("nftCollectionId")]
    fn nft_collection_id(&self) -> SingleValueMapper<TokenIdentifier>;

    #[storage_mapper("epochTopPainterHistory")]
    fn epoch_top_painter_history(&self, epoch: u64) -> SingleValueMapper<ManagedAddress>;

    /// Per-epoch "ended" flag: blocks a second endEpoch (duplicate NFTs) and
    /// gates the next startEpoch until the prior epoch is closed.
    #[storage_mapper("epochEnded")]
    fn epoch_ended(&self, epoch: u64) -> SingleValueMapper<bool>;

    // Events
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

    #[event("epochStarted")]
    fn epoch_started_event(
        &self,
        #[indexed] epoch: u64,
        #[indexed] start_timestamp: u64,
    );

    #[event("epochEnded")]
    fn epoch_ended_event(
        &self,
        #[indexed] epoch: u64,
        #[indexed] top_painter: &ManagedAddress,
        #[indexed] top_paint_count: u64,
    );

    #[event("voteCast")]
    fn vote_cast_event(
        &self,
        #[indexed] epoch: u64,
        #[indexed] voter: &ManagedAddress,
        #[indexed] charity_index: u32,
    );

    // Auction events
    #[event("auctionStarted")]
    fn auction_started_event(
        &self,
        #[indexed] epoch: u64,
        #[indexed] section_x: u32,
        #[indexed] section_y: u32,
        #[indexed] end_ts: u64,
    );

    #[event("bidPlaced")]
    fn bid_placed_event(
        &self,
        #[indexed] epoch: u64,
        #[indexed] bidder: &ManagedAddress,
        #[indexed] amount: &BigUint,
        #[indexed] total: &BigUint,
    );

    #[event("auctionClosed")]
    fn auction_closed_event(
        &self,
        #[indexed] epoch: u64,
        #[indexed] winner: &ManagedAddress,
        #[indexed] winning_bid: &BigUint,
    );

    // Internal helpers
    /// Increments epoch, resets painter tracking, records timestamp.
    /// Returns the new epoch number.
    fn start_epoch_internal(&self) -> u64 {
        // A previous epoch must be formally ended before a new one can begin.
        let prev = self.current_epoch().get();
        if prev > 0u64 {
            require!(
                self.epoch_ended(prev).get(),
                "Previous epoch must be ended first",
            );
        }
        let new_epoch = prev + 1u64;
        self.current_epoch().set(new_epoch);

        // Self-heal a stale tiny duration so the new epoch isn't immediately "ended".
        if self.epoch_duration_seconds().get() < 30u64 {
            self.epoch_duration_seconds().set(DEFAULT_EPOCH_DURATION);
        }

        self.epoch_start_timestamp().set(self.blockchain().get_block_timestamp());
        self.epoch_top_painter().clear();
        self.epoch_top_paint_count().set(0u64);
        self.epoch_started_event(new_epoch, self.blockchain().get_block_timestamp());
        new_epoch
    }

    fn find_winning_charity(&self, epoch: u64) -> ManagedAddress {
        let n = self.epoch_charity_names(epoch).len();
        if n == 0 {
            return self.charity_address().get();
        }
        let vote_mapper = self.epoch_vote_counts(epoch);
        if vote_mapper.len() == 0 {
            return self.charity_address().get();
        }
        let mut max_votes: u64 = 0;
        let mut winner_idx: usize = 1;
        for i in 1..=vote_mapper.len() {
            let vc = vote_mapper.get(i);
            if vc > max_votes {
                max_votes = vc;
                winner_idx = i;
            }
        }
        self.epoch_charity_addrs(epoch).get(winner_idx)
    }

    fn record_paint(&self, painter: &ManagedAddress, count: u64) {
        let epoch = self.current_epoch().get();
        if epoch == 0u64 {
            return; // No active epoch — painting still works, just not tracked
        }
        self.epoch_pixel_count(epoch, painter)
            .update(|c| *c += count);
        let new_total = self.epoch_pixel_count(epoch, painter).get();
        if new_total > self.epoch_top_paint_count().get() {
            self.epoch_top_paint_count().set(new_total);
            self.epoch_top_painter().set(painter);
        }
    }

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
        let owner_half = amount / 2u64;
        let charity_half = amount - &owner_half;

        let owner_addr = self.blockchain().get_owner_address();
        self.send().direct_egld(&owner_addr, &owner_half);

        // Accumulate charity EGLD; it is sent to the vote winner at epoch end
        self.total_egld_for_charity()
            .update(|t| *t += &charity_half);
    }

    fn require_owner(&self) {
        let caller = self.blockchain().get_caller();
        let owner = self.blockchain().get_owner_address();
        require!(caller == owner, "Only the contract owner can call this.");
    }
}
