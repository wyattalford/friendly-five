## Problem Statement

### Domain
The domain is informal peer-to-peer betting between people who already know each other. Friends often make small predictions or wagers about sports, future events, personal challenges, and more. The stake may be money, food, push-ups, or just bragging rights. One person proposes a claim with a stake and potentially a multiplier, the other accepts or changes the terms, and they settle after the outcome is known and agreed upon.

The primary stakeholders here are the people making the bet. Stakeholders participate because putting something on the line and writing it down makes a prediction or bet more exciting, turning a simple disagreement into a fun, rewarding challenge. Other friends may follow/watch the agreement, or help judge the result if they disagree about the settlement outcome. Unlike sportsbook or prediction-market customers, these participants choose their own opponents and may bet on personal events that no commercial platform would list. These participants want to compete for fun without creating conflict over unclear terms or unsettled obligations.

### Stakeholders

- **Bet proposer:** Starts the bet by proposing a claim and stakes, and needs a clear record of what the other person accepted.
- **Invited participant:** Reviews and may negotiate the proposal, and needs to understand the terms before committing to an obligation.
- **Neutral resolver:** A person trusted by both participants who may judge the outcome or resolve a dispute, and needs agreed terms and relevant evidence to make a fair decision.
- **Person whose behavior is being bet on:** May be affected by attention or pressure from a bet about their actions, even if they are not one of the participants, and could also be the neutral resolver.

### Bad Situations
1. Two friends remember different versions of the same bet. During a football game, John says, "5 dollars says that MIT wins," and Walker agrees. They never specify what happens in the event of a non-normal outcome, like a tie, postponement, or cancellation. When an unusual outcome occurs, each remembers the conversation in a way that supports his side. Neither can prove what was accepted. The five-dollar stake is too small to justify a serious confrontation, but conceding feels unfair, so a bet intended to make the game more fun creates an argument instead.

2. A custom bet has no fair way to be resolved. Eli bets Noah that a friend will arrive late to an event. They set a date and stake but never define “late.” Eli later argues that five minutes counts, while Noah says it means at least fifteen. Both have an incentive to interpret the result in their own favor, and they never selected a neutral person or source to decide. The bet remains unresolved, creating lingering tension and making both friends less willing to trust future agreements.

3. A bet is forgotten or never settled. Friends make several bets through texts, group chats, and in-person conversations. Weeks later, they cannot remember the exact odds, deadline, stake, or whether somebody already paid. Recovering the terms requires searching through old messages and relying on incomplete memories. Because the stake is small, someone may abandon a legitimate claim rather than spend time investigating or risk appearing petty by repeatedly asking a friend to pay.

### Corroboration
I spoke with a couple of friends who have made informal bets in the past, and we all remembered situations where unclear terms or forgotten details led to arguments and strained relationships. The disagreement was typically not about the bet's size, but about one person believing a different meaning of the bet was obvious when it was made. 

A public account provides a concrete example of how assumed terms can damage a friendship. In a 2014 AzBilliards forum discussion, a player reported playing two games with a friend without discussing a wager. After winning, the friend claimed they had been playing for their usual five dollars per game. The poster believed they were playing casually, described an argument, and later said they did not intend to play with that friend again.[^dispute] The disagreement concerned whether a wager had been accepted at all, showing how familiarity can lead friends to assume a shared understanding that does not exist. 

Both my conversations and the forum account are anecdotal, and the forum account cannot be independently verified. They illustrate how unclear agreements can create conflict, but do not establish how frequently these problems occur. The broader survey evidence below establishes participation in informal betting rather than the prevalence of disputes.

A 2025 Pew Research Center survey of 9,916 U.S. adults provides broader evidence that informal betting is common.[^pew] The study found that 22% had bet money on sports during the previous year. In particular, 15% had bet with friends or family through casual bets, fantasy leagues, or private pools, compared with 10% who had used an online sportsbook, casino, or betting app. The survey does not measure how often informal bets produce disagreements, but it shows that a substantial population participates in the activity where these situations arise.

The same study also suggests a potential barrier to adoption, although it measures attitudes toward legalized sports betting rather than an app for informal agreements. 43% of respondents said legalized sports betting was bad for society, which is up from 34% in 2022, and 40% said it was bad for sports. These results suggest that some potential users and the general public may avoid anything presented as a betting app or worry that the app would encourage gambling and its associated harm. My proposed app would not hold money or operate as a sportsbook, and it could support nonmonetary stakes such as meals, favors, or bragging rights. Still, the negative public view matters, so the design should emphasize friendly agreements and accountability rather than encouraging more frequent or larger bets.

[^dispute]: naji, “How would you resolve bet no bet issue?” AzBilliards Forums, May 27, 2014, https://forums.azbilliards.com/threads/how-would-you-resolve-bet-no-bet-issue.364704/.
[^pew]: Pew Research Center, “Americans increasingly see legal sports betting as a bad thing for society and sports,” October 2, 2025, https://www.pewresearch.org/short-reads/2025/10/02/americans-increasingly-see-legal-sports-betting-as-a-bad-thing-for-society-and-sports/. 

### Workarounds and Comparables
#### Workarounds:
People use verbal agreements and group chats because they add almost no friction to a spontaneous bet. However, a verbal agreement leaves no record, while a group chat may spread the proposal, counteroffer, and acceptance across several messages. Neither creates a single shared version showing exactly what both participants accepted.

Notes and spreadsheets preserve information, but one participant usually owns and edits the record. The other may never confirm that it matches the agreement. Venmo makes it easy to transfer money, but a payment record does not establish the claim, odds, deadline, exceptions, or resolution method. These tools address individual parts of the activity without preserving the complete agreement.

#### Comparables:
The closest comparable is WagerLab, which lets friends propose and track bets using virtual units. However, its public-facing features focus on browsing existing odds, joining pools, and tracking results, not negotiating custom terms or resolving ambiguous/subjective outcomes. BroThrow also organizes bets between friends, but it is structured primarily around sports lines and monetary wagers, making it less suitable for personal challenges, nonmonetary stakes, or outcomes that require a trusted person to judge.

Sportsbooks and prediction market exchanges such as DraftKings and Kalshi reduce ambiguity by defining standardized markets and controlling settlement. However, users cannot create private agreements about arbitrary events or negotiate the terms directly with a friend.

The important gap is that these products generally assume the meaning and resolution of a bet are already clear. Informal bets often fail before the outcome occurs because participants never agree on the same precise claim, deadline, exceptions, or resolution method, and a sportsbook won't give your small one-off bet the time of day. The opportunity is therefore not simply another way to place and track bets, but a way to turn a casual conversation into a shared agreement that remains trustworthy when the participants later have opposing incentives.

### Solution Sketch
I propose a web app that treats a friendly bet as a shared agreement rather than a simplified sportsbook wager. One person creates a bet by stating a testable claim, deadline, stakes, exceptions, and method of resolution. An objective bet must identify the source that will determine its outcome, while a subjective bet must name a neutral resolver. The invited friend may accept, reject, or counter the proposal. Any change creates a new version that both participants must approve, and the accepted version is then locked.

The interaction should remain close to how these bets already begin. A creator can share a link in the text or group chat where the conversation is happening. The purpose is not to make a five-dollar bet feel like a legal contract, but to record the few decisions that become difficult to make fairly after the outcome is known.

When the deadline arrives, a participant or the designated resolver submits an outcome and may attach supporting evidence. The other participant either confirms it or disputes it. If the resolution is disputed, the chosen resolver decides. If no resolver was selected, both participants must agree on the outcome or void the bet. The app records the result and whether any external obligation was completed, but it does not hold or transfer money, keeping payment and regulatory complexity outside the project’s scope.

The first version will support only one-on-one bets, externally settled stakes, and invited resolvers. Public markets, tradable contracts, automated sports feeds, and in-app payments will remain outside its scope.

Mutual acceptance prevents conflicting memories. Predetermined resolution rules prevent participants from redefining the outcome after learning which interpretation benefits them. A shared history prevents bets and settlements from disappearing across conversations. Together, these mechanisms address the moment when a normally friendly bet becomes unfriendly, and now no one has fun.
