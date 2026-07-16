# Sidebar Quota Status Row Design

## Goal

Replace the floating Desktop title-bar quota ring and the Desktop profile
avatar marker with one compact combined-quota status row in the sidebar
footer. Render the same quota status row in the Codex Mobile PWA sidebar
footer.

## Approved Layout

The footer control shows:

- a 28-pixel circular progress ring containing the rounded average remaining
  7-day quota;
- the primary label, for example `47% quota`;
- the configured pool size, for example `7 accounts`;
- the existing Help control on Desktop and the existing repository/system
  controls in Codex Mobile without covering or displacing them.

The Desktop profile avatar and account-name marker are removed. The quota
control is not rendered in the title bar. Codex Mobile no longer renders its
quota strip above the conversation.

## Interaction

The entire compact quota row is a keyboard-focusable button. Clicking it,
focusing it, or hovering it opens a detail panel above the footer. The panel
closes on pointer exit or focus exit.

The detail panel shows:

- combined 7-day total remaining percentage;
- combined 7-day average remaining percentage;
- account count and reporting-account count;
- update age;
- 5-hour information only when the status payload contains a 5-hour window.

The control uses neutral sidebar styling. Green, amber, and red are reserved
for the progress ring and follow the existing quota thresholds. Missing quota
data renders a muted unavailable state without inventing a value.

## Desktop Architecture

The existing `multi-auth-thread-status` preload bridge remains the source of
the sanitized pool snapshot. Its DOM bootstrap mounts the quota row into a
stable sidebar-footer anchor instead of using fixed title-bar coordinates.

The existing profile-footer bundle patch adds that stable anchor and removes
the profile button from the rendered footer while retaining Help. The preload
bootstrap waits for the anchor with a bounded `MutationObserver`, so initial
render timing does not affect placement. It must not create duplicate quota
controls across renderer updates.

The current status-file validation and 60-second refresh cadence remain
unchanged.

## Codex Mobile Architecture

Codex Mobile continues to consume the strict, typed `poolQuota` object already
returned by its server. `AccountQuotaStrip` becomes a reusable compact footer
control and is rendered by `renderSidebarContent`, so desktop-width and
mobile-width PWA sidebars share one implementation.

The conversation-level quota strip is removed. The component continues to
show routed-account details in its expanded panel, but it omits 5-hour labels
when `quota5h` and the combined 5-hour pool window are both absent.

## Accessibility

- The button has an explicit combined-quota label including percentage and
  account count when available.
- Expanded state is exposed with `aria-expanded`.
- The detail panel is connected with `aria-controls`.
- The ring is decorative because the same value is present as text.
- Unavailable and pending states use readable text, not color alone.

## Verification

Desktop tests must prove that the injected control targets the footer anchor,
does not retain fixed title-bar positioning, keeps Help, removes the avatar,
and omits unavailable 5-hour detail.

Codex Mobile tests must prove that the compact row renders in both sidebar
variants, the old conversation strip is absent, 5-hour detail is omitted when
unavailable, and expanded 7-day/account details remain accessible.
