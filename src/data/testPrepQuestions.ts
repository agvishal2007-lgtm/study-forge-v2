import type { Section, TestId } from './testPrepRules';

/*
 * Practice questions, written from scratch for Study Forge.
 *
 * These are not College Board questions and are not copied from anywhere: every passage and every
 * problem here is original, written to the published shape of each content domain. That is said
 * plainly on the screen too, along with the fact that practice here cannot predict a test-day
 * score. The official practice tests remain the best thing to sit alongside this, and the app links
 * to them rather than implying it replaces them.
 *
 * Levels are a rough three-step ladder, used only to keep an eighth grader from being handed
 * questions pitched at the SAT. They are not a claimed difficulty rating.
 */

export interface PrepQuestion {
  id: string;
  section: Section;
  domain: string;
  level: 1 | 2 | 3;
  /** Something to read, for the questions that need it. Original text. */
  passage?: string;
  prompt: string;
  /** Four options, or none at all for a question the student types the answer to. */
  choices?: string[];
  /** Which option is right, when there are options. */
  answer?: number;
  /** Accepted typed answers, compared loosely, for a question with no options. */
  accepts?: string[];
  /** Why the answer is the answer — the part that makes practice worth doing. */
  why: string;
}

/** Which levels suit a test, so nobody is handed something pitched for a different exam. */
export const levelsFor = (test: TestId): number[] =>
  test === 'psat-8-9' ? [1, 2] : test === 'sat' ? [1, 2, 3] : [1, 2, 3];

export const QUESTIONS: PrepQuestion[] = [
  // ---------- Reading and Writing: Information and Ideas ----------
  {
    id: 'info-1',
    section: 'rw',
    domain: 'information',
    level: 1,
    passage:
      'Honeybees are not the only insects that pollinate crops, and in some places they are not even the most effective. Solitary bees, which nest alone rather than in hives, often carry pollen loosely on their abdomens instead of packing it tightly on their legs. Because the pollen is loose, more of it brushes off onto the next flower the bee visits.',
    prompt: 'Which choice best states the main idea of the text?',
    choices: [
      'Solitary bees can pollinate more effectively than honeybees because of how they carry pollen.',
      'Honeybees pack pollen tightly onto their legs before returning to the hive.',
      'Most crops grown for food depend entirely on honeybees for pollination.',
      'Solitary bees build nests that are harder for researchers to study than hives are.',
    ],
    answer: 0,
    why: 'The passage sets up a comparison and then explains it: loose pollen brushes off more easily, so solitary bees can pollinate better. The other options are details from the passage, or claims it never makes.',
  },
  {
    id: 'info-2',
    section: 'rw',
    domain: 'information',
    level: 2,
    passage:
      'When the city replaced four blocks of on-street parking with a protected bike lane, nearby shop owners expected to lose customers who drove. Two years later, total sales along those blocks had risen 9 percent, while sales on comparable streets elsewhere in the city rose 3 percent. Surveys found that cyclists and pedestrians visited the shops more often than drivers had, though they spent less on each visit.',
    prompt: 'Which choice is best supported by the text?',
    choices: [
      'Shoppers who arrive by bicycle spend more per visit than shoppers who arrive by car.',
      'More frequent visits can more than make up for smaller spending on each visit.',
      'Removing on-street parking always increases sales for nearby businesses.',
      'The shop owners had opposed the bike lane before it was built.',
    ],
    answer: 1,
    why: 'Sales rose even though each visit was smaller, and the surveys say visits became more frequent — so frequency outweighed the smaller baskets. The first option reverses what the text says, "always" is far stronger than one street supports, and the owners\' expectations are not the same as opposition.',
  },
  {
    id: 'info-3',
    section: 'rw',
    domain: 'information',
    level: 2,
    passage:
      'A researcher claims that the mosaics in a Roman villa were laid by at least two different workshops. The floor of the main hall uses cubes cut from local limestone, averaging eight millimetres across. The floor of the adjoining dining room uses glass cubes imported from the eastern Mediterranean, averaging four millimetres, set in a mortar of a different composition.',
    prompt: "Which finding, if true, would most strongly support the researcher's claim?",
    choices: [
      'Both rooms show patterns that were popular throughout the Roman world.',
      'The villa was occupied for roughly two centuries before it was abandoned.',
      'Workshops of the period normally used a single material and one mortar recipe throughout a commission.',
      'Glass cubes were more expensive than limestone cubes in every Roman province.',
    ],
    answer: 2,
    why: 'The claim rests on two rooms differing in material, size and mortar. That only points to two workshops if one workshop would have been consistent — which is exactly what the third option establishes. The others are true-sounding background that leaves the inference untouched.',
  },
  {
    id: 'info-4',
    section: 'rw',
    domain: 'information',
    level: 3,
    passage:
      'A team measured how long seeds stayed viable in soil. After five years buried at ten centimetres, 61 percent of the seeds of one grassland species still germinated, compared with 12 percent of a woodland species. At twenty centimetres, the grassland figure fell to 48 percent while the woodland figure was 11 percent.',
    prompt: 'Which statement about the data is accurate?',
    choices: [
      'Burial depth made a larger difference to the grassland species than to the woodland species.',
      'The woodland species was more sensitive to burial depth than the grassland species.',
      'At both depths, fewer than half of the grassland seeds germinated.',
      'Deeper burial increased viability for both species.',
    ],
    answer: 0,
    why: 'Grassland fell 61 to 48, a drop of 13 points; woodland fell 12 to 11, a drop of 1. So depth mattered more to the grassland species. The third option is wrong because 61 percent is above half, and the fourth reverses the direction of both changes.',
  },

  // ---------- Reading and Writing: Craft and Structure ----------
  {
    id: 'craft-1',
    section: 'rw',
    domain: 'craft',
    level: 1,
    passage:
      'The engineer was candid about the bridge design: it would be cheaper than the alternatives, she said, but it would also need inspection twice as often.',
    prompt: 'As used in the text, what does "candid" most nearly mean?',
    choices: ['Hopeful', 'Honest', 'Uncertain', 'Technical'],
    answer: 1,
    why: 'She states an advantage and a real drawback in the same breath, which is straightforwardness. "Candid" means honest or frank. Nothing in the sentence suggests hope, doubt about the facts, or that she is being especially technical.',
  },
  {
    id: 'craft-2',
    section: 'rw',
    domain: 'craft',
    level: 2,
    passage:
      'For decades the painting\'s attribution was treated as settled. The new analysis does not overturn it so much as qualify it: the hand is almost certainly the master\'s, but at least two passages of drapery appear to have been finished by an assistant.',
    prompt: 'As used in the text, what does "qualify" most nearly mean?',
    choices: ['Make eligible', 'Limit the scope of', 'Disprove entirely', 'Describe in detail'],
    answer: 1,
    why: 'The sentence contrasts "overturn" with "qualify", then narrows the claim: mostly the master, partly an assistant. That narrowing is limiting the scope. "Disprove entirely" is the thing the text says it does not do, and "make eligible" is the everyday sense of the word, not this one.',
  },
  {
    id: 'craft-3',
    section: 'rw',
    domain: 'craft',
    level: 2,
    passage:
      'Sea otters eat enormous quantities of sea urchins. Where otters have returned, urchin numbers fall and kelp forests regrow. [1] This matters beyond the otters themselves. [2] Kelp forests shelter young fish, blunt the force of storm waves, and store carbon in their tissues.',
    prompt: 'What is the main rhetorical function of sentence 1?',
    choices: [
      'It introduces a counterexample to the preceding claim.',
      'It signals that the discussion is about to widen from otters to wider consequences.',
      'It offers evidence that otters eat urchins.',
      'It qualifies the claim that kelp forests have regrown.',
    ],
    answer: 1,
    why: 'Sentence 1 is a hinge: it says the point is bigger than otters, and the next sentence delivers those bigger consequences. It adds no evidence, contradicts nothing, and takes nothing back.',
  },
  {
    id: 'craft-4',
    section: 'rw',
    domain: 'craft',
    level: 3,
    passage:
      'Text 1: Museums should return objects taken during colonial rule. Ownership was never freely given, and a collection built on coercion cannot be justified by the care it now receives.\n\nText 2: Return is often right, but it is not a single answer. Some objects were genuinely purchased, some communities ask for loans rather than transfers, and some ask that an object stay where more people can see it. The question has to be asked case by case.',
    prompt: 'Based on the texts, how would the author of Text 2 most likely respond to Text 1?',
    choices: [
      'By arguing that museums have no obligation to return any objects.',
      'By agreeing with its conclusion in many cases while objecting to its treating all cases alike.',
      'By claiming that the quality of a museum\'s care settles the question of ownership.',
      'By disputing that objects were ever taken under coercion.',
    ],
    answer: 1,
    why: 'Text 2 opens with "Return is often right" — agreement — and then objects to one answer covering everything. The other options contradict Text 2, which never denies coercion and explicitly refuses to let care settle ownership.',
  },

  // ---------- Reading and Writing: Expression of Ideas ----------
  {
    id: 'expr-1',
    section: 'rw',
    domain: 'expression',
    level: 1,
    passage:
      'The first printing presses in the region were slow and expensive to run. ______ within thirty years, printed books outnumbered manuscripts in most large libraries.',
    prompt: 'Which choice completes the text with the most logical transition?',
    choices: ['Therefore,', 'Nevertheless,', 'For example,', 'Similarly,'],
    answer: 1,
    why: 'The two halves pull against each other: slow and expensive, yet printing won out quickly. That needs a contrast word. "Therefore" and "Similarly" claim agreement, and "For example" would make the second sentence an instance of the first, which it is not.',
  },
  {
    id: 'expr-2',
    section: 'rw',
    domain: 'expression',
    level: 2,
    passage:
      'Lichens are not single organisms but partnerships between a fungus and an alga. ______ a lichen can colonise bare rock, where neither partner could survive alone.',
    prompt: 'Which choice completes the text with the most logical transition?',
    choices: ['As a result,', 'In contrast,', 'Admittedly,', 'Meanwhile,'],
    answer: 0,
    why: 'The partnership is the cause and surviving on bare rock is its consequence, so a result word fits. Nothing is being contrasted, conceded, or placed at the same time as something else.',
  },
  {
    id: 'expr-3',
    section: 'rw',
    domain: 'expression',
    level: 2,
    passage:
      'Notes:\n- The Rosetta Stone carries the same decree in three scripts.\n- Scholars could already read ancient Greek.\n- Egyptian hieroglyphs had not been read for centuries.\n- Comparing the Greek text with the hieroglyphic text let scholars begin decoding hieroglyphs.',
    prompt: 'The student wants to explain why the stone was so useful. Which choice best uses the notes to accomplish that goal?',
    choices: [
      'The Rosetta Stone carries a decree written in three different scripts.',
      'Because scholars could already read the stone\'s Greek text, comparing it with the hieroglyphic version of the same decree gave them a way into a script no one had read for centuries.',
      'Ancient Greek was known to scholars, and Egyptian hieroglyphs were not.',
      'The decree on the Rosetta Stone was recorded in Greek as well as in hieroglyphs.',
    ],
    answer: 1,
    why: 'The goal is to explain the usefulness, which means linking the known script to the unknown one. Only the second option makes that connection; the others are accurate statements that stop short of answering why it mattered.',
  },
  {
    id: 'expr-4',
    section: 'rw',
    domain: 'expression',
    level: 3,
    passage:
      'Notes:\n- A city planted 2,000 street trees in one district in 2015.\n- Summer afternoon air temperatures in that district are now about 1.5 degrees Celsius lower than in a comparable district.\n- Emergency calls for heat illness in the planted district fell by 18 percent over the same period.\n- Researchers caution that other changes in the district were not controlled for.',
    prompt: 'The student wants to present the findings while acknowledging their limits. Which choice best uses the notes to accomplish that goal?',
    choices: [
      'Planting 2,000 street trees lowered summer temperatures by 1.5 degrees Celsius and cut heat illness calls by 18 percent.',
      'The planted district is cooler and has fewer heat illness calls, though researchers note that other changes in the district were not controlled for.',
      'Researchers cannot say whether street trees have any effect on summer temperatures.',
      'A city planted 2,000 street trees in one district in 2015, and emergency calls fell afterwards.',
    ],
    answer: 1,
    why: 'The goal has two parts, findings and limits, and only the second option does both. The first states cause outright, which the notes warn against; the third overstates the caution into knowing nothing; the fourth drops the caveat entirely.',
  },

  // ---------- Reading and Writing: Standard English Conventions ----------
  {
    id: 'conv-1',
    section: 'rw',
    domain: 'conventions',
    level: 1,
    passage: 'The collection of letters, donated by the author\'s family, ______ now open to researchers.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ['are', 'is', 'were', 'have been being'],
    answer: 1,
    why: 'The subject is "collection", which is singular; "of letters" and the phrase between the commas do not change it. So the verb is "is". A good habit is to read the sentence with the middle removed: "The collection is now open."',
  },
  {
    id: 'conv-2',
    section: 'rw',
    domain: 'conventions',
    level: 1,
    passage: 'The storm knocked out power for two days ______ the greenhouse lost an entire crop of seedlings.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: [', and', ',', '; and so', ' and,'],
    answer: 0,
    why: 'Two complete sentences are being joined, so they need a comma plus a joining word, or a semicolon on its own. A comma alone is a splice, and the other two options pile up punctuation and conjunctions that cannot sit together.',
  },
  {
    id: 'conv-3',
    section: 'rw',
    domain: 'conventions',
    level: 2,
    passage: 'The three ______ findings were published within weeks of one another.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ["team's", 'teams', "teams'", 'teams’s'],
    answer: 2,
    why: 'There are three teams and the findings belong to them, so it is a plural possessive: teams, then an apostrophe after the s. "Team\'s" would mean one team, and "teams" with no apostrophe shows no possession at all.',
  },
  {
    id: 'conv-4',
    section: 'rw',
    domain: 'conventions',
    level: 2,
    passage: 'Having studied the migration data for a decade, ______',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: [
      'the patterns were obvious to the ecologist.',
      'the ecologist recognised the patterns at once.',
      'it was obvious to the ecologist what the patterns were.',
      'the patterns had become obvious.',
    ],
    answer: 1,
    why: 'The opening phrase describes whoever did the studying, so that person has to be the subject of what follows. Only the second option puts the ecologist there; the others leave the phrase modifying patterns, which cannot study anything.',
  },
  {
    id: 'conv-5',
    section: 'rw',
    domain: 'conventions',
    level: 3,
    passage: 'The expedition carried only what three people could haul on foot ______ food for forty days, a repair kit, and a radio.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: [':', ',', ';', ' and'],
    answer: 0,
    why: 'What comes before the blank is a complete sentence, and what follows is a list that spells it out. A colon is what introduces an explanation or list after a complete sentence. A comma or "and" would run the list straight on without marking it, and a semicolon needs a full sentence on both sides.',
  },

  // ---------- Math: Algebra ----------
  {
    id: 'alg-1',
    section: 'math',
    domain: 'algebra',
    level: 1,
    prompt: 'If 3x + 7 = 25, what is the value of x?',
    choices: ['4', '6', '8', '32/3'],
    answer: 1,
    why: 'Take 7 from both sides to get 3x = 18, then divide by 3: x = 6. Checking it back, 3(6) + 7 = 25.',
  },
  {
    id: 'alg-2',
    section: 'math',
    domain: 'algebra',
    level: 1,
    prompt: 'A line in the xy-plane passes through (0, 4) and has slope −2. Which equation represents the line?',
    choices: ['y = 4x − 2', 'y = −2x + 4', 'y = −2x − 4', 'y = 2x + 4'],
    answer: 1,
    why: 'In y = mx + b, m is the slope and b is the y-value where x = 0. Here m = −2 and the point (0, 4) gives b = 4, so y = −2x + 4.',
  },
  {
    id: 'alg-3',
    section: 'math',
    domain: 'algebra',
    level: 2,
    prompt: 'If 2x + 3y = 12 and x = y + 1, what is the value of y?',
    accepts: ['2'],
    why: 'Substitute x = y + 1 into the first equation: 2(y + 1) + 3y = 12, so 5y + 2 = 12 and y = 2. Then x = 3, and 2(3) + 3(2) = 12 checks out.',
  },
  {
    id: 'alg-4',
    section: 'math',
    domain: 'algebra',
    level: 2,
    prompt:
      'A phone plan costs $25 per month plus $0.10 for each gigabyte of data used above 5 gigabytes. If g is the number of gigabytes used and the monthly bill must be no more than $30, which inequality describes the possible values of g for g ≥ 5?',
    choices: ['g ≤ 30', 'g ≤ 50', 'g ≤ 55', 'g ≤ 505'],
    answer: 2,
    why: 'The bill is 25 + 0.10(g − 5) ≤ 30. Subtract 25: 0.10(g − 5) ≤ 5. Divide by 0.10: g − 5 ≤ 50, so g ≤ 55. Forgetting to add the 5 back is what produces the common wrong answer of 50.',
  },
  {
    id: 'alg-5',
    section: 'math',
    domain: 'algebra',
    level: 3,
    prompt: 'The system 4x + ky = 20 and 2x + 5y = 10 has infinitely many solutions. What is the value of k?',
    accepts: ['10'],
    why: 'Infinitely many solutions means the two equations describe the same line. Doubling the second gives 4x + 10y = 20, which matches the first exactly when k = 10.',
  },

  // ---------- Math: Advanced Math ----------
  {
    id: 'adv-1',
    section: 'math',
    domain: 'advanced',
    level: 1,
    prompt: 'What are the solutions to x² − 5x + 6 = 0?',
    choices: ['x = 1 and x = 6', 'x = 2 and x = 3', 'x = −2 and x = −3', 'x = 5 and x = 6'],
    answer: 1,
    why: 'Factor into (x − 2)(x − 3) = 0, since −2 and −3 multiply to 6 and add to −5. So x = 2 or x = 3.',
  },
  {
    id: 'adv-2',
    section: 'math',
    domain: 'advanced',
    level: 2,
    prompt: 'If f(x) = 2x² − 8, what is the value of f(3)?',
    accepts: ['10'],
    why: 'Put 3 in place of x: 2(3²) − 8 = 2(9) − 8 = 18 − 8 = 10. The square happens before the multiplication.',
  },
  {
    id: 'adv-3',
    section: 'math',
    domain: 'advanced',
    level: 2,
    prompt:
      'A population of 500 bacteria doubles every 6 hours. Which function gives the population after t hours?',
    choices: ['P(t) = 500 · 2^(6t)', 'P(t) = 500 · 2^(t/6)', 'P(t) = 500 + 2t/6', 'P(t) = 500 · 6^(t/2)'],
    answer: 1,
    why: 'Each doubling multiplies by 2, and the number of doublings in t hours is t ÷ 6. So the exponent is t/6. At t = 6 this gives 500 · 2 = 1,000, which is one doubling, as it should be.',
  },
  {
    id: 'adv-4',
    section: 'math',
    domain: 'advanced',
    level: 3,
    prompt: 'What is the vertex of the parabola y = x² − 6x + 11?',
    choices: ['(3, 2)', '(−3, 38)', '(6, 11)', '(3, −2)'],
    answer: 0,
    why: 'The vertex sits at x = −b/(2a) = 6/2 = 3. Then y = 9 − 18 + 11 = 2, giving (3, 2). Completing the square shows the same thing: y = (x − 3)² + 2.',
  },
  {
    id: 'adv-5',
    section: 'math',
    domain: 'advanced',
    level: 3,
    prompt: 'If x + 3 is a factor of x² + bx + 15, what is the value of b?',
    accepts: ['8'],
    why: 'If x + 3 is a factor then x = −3 makes the expression zero: 9 − 3b + 15 = 0, so 3b = 24 and b = 8. Indeed x² + 8x + 15 = (x + 3)(x + 5).',
  },

  // ---------- Math: Problem-Solving and Data Analysis ----------
  {
    id: 'data-1',
    section: 'math',
    domain: 'data',
    level: 1,
    prompt: 'A shirt priced at $40 is marked down by 25 percent. What is the sale price, in dollars?',
    accepts: ['30', '$30', '30.00'],
    why: '25 percent of 40 is 10, so the price drops by 10 to $30. Equivalently, paying 75 percent of 40 gives 0.75 × 40 = 30.',
  },
  {
    id: 'data-2',
    section: 'math',
    domain: 'data',
    level: 1,
    prompt: 'Three pounds of apples cost $7.50. At the same rate, what is the cost of 5 pounds, in dollars?',
    accepts: ['12.5', '12.50', '$12.50'],
    why: 'One pound costs 7.50 ÷ 3 = 2.50, so five pounds cost 5 × 2.50 = $12.50.',
  },
  {
    id: 'data-3',
    section: 'math',
    domain: 'data',
    level: 2,
    prompt:
      'A bag holds 4 red marbles, 6 blue marbles, and 10 green marbles. One marble is drawn at random. What is the probability that it is not green?',
    choices: ['1/2', '1/4', '2/5', '3/5'],
    answer: 0,
    why: 'There are 20 marbles in total and 10 of them are not green, so the probability is 10/20 = 1/2. Counting the non-green marbles directly, 4 + 6 = 10, gives the same thing.',
  },
  {
    id: 'data-4',
    section: 'math',
    domain: 'data',
    level: 2,
    prompt: 'The mean of five numbers is 12. Four of them are 10, 11, 13, and 14. What is the fifth number?',
    accepts: ['12'],
    why: 'Five numbers with a mean of 12 add to 5 × 12 = 60. The four given add to 48, so the fifth is 60 − 48 = 12.',
  },
  {
    id: 'data-5',
    section: 'math',
    domain: 'data',
    level: 3,
    prompt:
      'In a random sample of 200 students at a school of 1,500, 34 percent said they walk to school. Which is the best estimate of the number of students at the school who walk?',
    choices: ['68', '340', '510', '680'],
    answer: 2,
    why: 'The sample proportion is applied to the whole school: 0.34 × 1,500 = 510. Using 34 percent of 200 gives 68, which is the number in the sample, not in the school.',
  },

  // ---------- Math: Geometry and Trigonometry ----------
  {
    id: 'geo-1',
    section: 'math',
    domain: 'geometry',
    level: 1,
    prompt: 'Two angles are supplementary. One measures 125 degrees. What is the measure of the other, in degrees?',
    accepts: ['55'],
    why: 'Supplementary angles add to 180 degrees, so the other is 180 − 125 = 55.',
  },
  {
    id: 'geo-2',
    section: 'math',
    domain: 'geometry',
    level: 1,
    prompt: 'A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?',
    accepts: ['10'],
    why: 'By the Pythagorean theorem, 6² + 8² = 36 + 64 = 100, and the hypotenuse is the square root of 100, which is 10.',
  },
  {
    id: 'geo-3',
    section: 'math',
    domain: 'geometry',
    level: 2,
    prompt: 'What is the area of a circle with radius 5?',
    choices: ['10π', '25π', '50π', '100π'],
    answer: 1,
    why: 'Area is πr², so π × 5² = 25π. The answer 10π is the circumference, 2πr, which is easy to reach for by mistake.',
  },
  {
    id: 'geo-4',
    section: 'math',
    domain: 'geometry',
    level: 2,
    prompt:
      'In a right triangle, the side opposite angle θ has length 7 and the hypotenuse has length 25. What is sin θ?',
    choices: ['7/24', '7/25', '24/25', '25/7'],
    answer: 1,
    why: 'Sine is the opposite side over the hypotenuse, so sin θ = 7/25. The value 24/25 is the cosine, since the third side is 24.',
  },
  {
    id: 'geo-5',
    section: 'math',
    domain: 'geometry',
    level: 3,
    prompt: 'A cylinder has radius 3 and height 10. What is its volume?',
    choices: ['30π', '60π', '90π', '900π'],
    answer: 2,
    why: 'The volume of a cylinder is πr²h, so π × 3² × 10 = 90π. Using the radius without squaring it gives 30π.',
  },
  {
    id: 'geo-6',
    section: 'math',
    domain: 'geometry',
    level: 3,
    prompt: 'In a circle of radius 6, what is the length of an arc cut off by a central angle of 60 degrees?',
    choices: ['π', '2π', '6π', '12π'],
    answer: 1,
    why: 'The arc is 60/360, that is one sixth, of the circumference. The circumference is 2π × 6 = 12π, and one sixth of that is 2π.',
  },

  // ---------- A second pass: more of each domain, so a session is never four questions long ----------
  {
    id: 'info-5',
    section: 'rw',
    domain: 'information',
    level: 2,
    passage:
      'A museum curator argues that a bronze figure found in a riverbed was made locally, pointing to its alloy, which matches ore from a mine twelve miles upstream. Metalworking tools of the same period have been excavated at a settlement beside that mine.',
    prompt: "Which finding, if true, would most weaken the curator's argument?",
    choices: [
      'The settlement beside the mine was occupied for several centuries.',
      'Ore from that mine was traded widely and worked in cities hundreds of miles away.',
      'The figure shows wear consistent with long handling before it entered the river.',
      'Other bronze objects have been recovered from the same stretch of river.',
    ],
    answer: 1,
    why: 'The argument rests on the alloy pointing to local manufacture. If that same ore was shipped elsewhere and worked there, the alloy no longer tells you where the figure was made — the link the whole claim depends on is broken. The other options are consistent with the claim or say nothing about where it was made.',
  },
  {
    id: 'craft-5',
    section: 'rw',
    domain: 'craft',
    level: 2,
    passage:
      'Her enthusiasm for the proposal was tempered by experience: she had seen three similar schemes approved and quietly abandoned.',
    prompt: 'As used in the text, what does "tempered" most nearly mean?',
    choices: ['Strengthened', 'Moderated', 'Hardened by heat', 'Concealed'],
    answer: 1,
    why: 'The colon explains it: past disappointments make her less enthusiastic, not unenthusiastic. "Moderated" is that reduction. "Hardened by heat" is the metalworking sense of the word, which is not how it is used here, and nothing suggests she is hiding anything.',
  },
  {
    id: 'expr-5',
    section: 'rw',
    domain: 'expression',
    level: 2,
    passage:
      'Most of the planet\'s fresh water is locked in ice sheets and glaciers. ______ the water people actually drink comes almost entirely from rivers, lakes and groundwater.',
    prompt: 'Which choice completes the text with the most logical transition?',
    choices: ['Consequently,', 'In other words,', 'By contrast,', 'For instance,'],
    answer: 2,
    why: 'Where the water is and where drinking water comes from are set against each other, so a contrast word fits. "Consequently" would make the second sentence follow from the first, which it does not, and the second sentence neither restates nor illustrates the first.',
  },
  {
    id: 'conv-6',
    section: 'rw',
    domain: 'conventions',
    level: 2,
    passage: 'Neither the students nor their teacher ______ expecting the fire drill.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ['were', 'was', 'have been', 'are'],
    answer: 1,
    why: 'With "neither… nor", the verb agrees with the subject nearer to it. That is "their teacher", which is singular, so "was". Had the order been reversed — neither the teacher nor the students — "were" would be right.',
  },
  {
    id: 'alg-6',
    section: 'math',
    domain: 'algebra',
    level: 2,
    prompt: 'A line passes through the points (2, 5) and (6, 13). Which equation represents the line?',
    choices: ['y = 2x + 1', 'y = 2x − 1', 'y = 4x − 3', 'y = x + 3'],
    answer: 0,
    why: 'The slope is the change in y over the change in x: (13 − 5) ÷ (6 − 2) = 8 ÷ 4 = 2. Using (2, 5): 5 = 2(2) + b, so b = 1, giving y = 2x + 1. Checking the other point, 2(6) + 1 = 13.',
  },
  {
    id: 'alg-7',
    section: 'math',
    domain: 'algebra',
    level: 2,
    prompt: 'If 3x + 2y = 16 and x = 2y, what is the value of y?',
    accepts: ['2'],
    why: 'Replace x with 2y: 3(2y) + 2y = 16, so 8y = 16 and y = 2. Then x = 4, and 3(4) + 2(2) = 16 checks out.',
  },
  {
    id: 'adv-6',
    section: 'math',
    domain: 'advanced',
    level: 2,
    prompt: 'Which expression is equivalent to (2x³)² · x?',
    choices: ['2x⁷', '4x⁶', '4x⁷', '2x⁶'],
    answer: 2,
    why: 'Squaring (2x³) squares both parts: 2² = 4 and (x³)² = x⁶, giving 4x⁶. Multiplying by x adds one to the exponent: 4x⁷. Forgetting to square the 2 is what produces 2x⁷.',
  },
  {
    id: 'adv-7',
    section: 'math',
    domain: 'advanced',
    level: 3,
    prompt: 'If f(x) = x² + 1 and g(x) = 2x, what is the value of f(g(2))?',
    accepts: ['17'],
    why: 'Work from the inside out. g(2) = 2(2) = 4, then f(4) = 4² + 1 = 17. Doing it the other way round, g(f(2)) = g(5) = 10, which is why the order matters.',
  },
  {
    id: 'data-6',
    section: 'math',
    domain: 'data',
    level: 2,
    prompt: 'The price of a textbook rose from $80 to $92. What was the percent increase?',
    choices: ['12%', '13%', '15%', '87%'],
    answer: 2,
    why: 'The increase is 92 − 80 = 12, and a percent increase is measured against the original price: 12 ÷ 80 = 0.15, or 15%. Dividing by the new price instead gives about 13%, which is the common slip.',
  },
  {
    id: 'data-7',
    section: 'math',
    domain: 'data',
    level: 2,
    prompt: 'A recipe uses 3 cups of flour to make 24 cookies. At the same rate, how many cups are needed for 60 cookies?',
    accepts: ['7.5', '15/2'],
    why: 'One cookie takes 3 ÷ 24 = 0.125 cups, so 60 cookies take 60 × 0.125 = 7.5 cups. As a proportion, 3/24 = x/60 gives 24x = 180 and x = 7.5.',
  },
  {
    id: 'geo-7',
    section: 'math',
    domain: 'geometry',
    level: 2,
    prompt: 'Two triangles are similar. The smaller has sides 3, 4 and 5. The longest side of the larger is 15. What is the length of its shortest side?',
    accepts: ['9'],
    why: 'Similar triangles are the same shape scaled, so every side is multiplied by the same number. The longest side went from 5 to 15, a scale of 3, so the shortest goes from 3 to 9.',
  },
  {
    id: 'geo-8',
    section: 'math',
    domain: 'geometry',
    level: 3,
    prompt: 'In a right triangle, the side adjacent to angle θ has length 8 and the hypotenuse has length 17. What is tan θ?',
    choices: ['8/17', '15/17', '15/8', '8/15'],
    answer: 2,
    why: 'Tangent is the opposite side over the adjacent one, so the third side is needed first: 17² − 8² = 289 − 64 = 225, so the opposite side is 15. That makes tan θ = 15/8. The value 8/17 is the cosine.',
  },

  // ---------- A third pass, one more in each domain ----------
  {
    id: 'info-6',
    section: 'rw',
    domain: 'information',
    level: 2,
    passage:
      'Octopuses have no skeleton, so they can squeeze through any gap wider than their beak — the one hard part of their body. Aquarium keepers who lost animals from apparently sealed tanks eventually worked out that the only opening that mattered was the smallest one an octopus could get its beak through.',
    prompt: 'Which choice best describes the function of the dash in the text?',
    choices: [
      'It introduces the exception that sets the limit the passage goes on to explain.',
      'It signals a change of subject from octopuses to aquarium keepers.',
      'It marks a quotation from the aquarium keepers.',
      'It separates two complete sentences that could stand alone.',
    ],
    answer: 0,
    why: 'The dash adds the detail that makes the first claim precise: the beak is the one hard part, so the beak sets the limit — which the second sentence then confirms. Nothing after the dash begins a new subject, quotes anyone, or forms a complete sentence of its own.',
  },
  {
    id: 'craft-6',
    section: 'rw',
    domain: 'craft',
    level: 3,
    passage:
      'Text 1: Standardised reading tests measure something real. Scores predict later school performance well enough that ignoring them would waste information.\n\nText 2: They predict performance, certainly — but so does family income, and nobody suggests testing for that. A measure that tracks advantage as closely as ability tells you less about a child than it appears to.',
    prompt: 'The author of Text 2 would most likely characterise the prediction described in Text 1 as',
    choices: [
      'stronger than the evidence supports.',
      'real but less informative than it seems.',
      'irrelevant to later school performance.',
      'impossible to measure reliably.',
    ],
    answer: 1,
    why: 'Text 2 opens by granting the prediction — "certainly" — then argues it carries less information than it looks like, because it tracks advantage too. It never disputes that the prediction exists or that it can be measured.',
  },
  {
    id: 'expr-6',
    section: 'rw',
    domain: 'expression',
    level: 2,
    passage:
      'Notes:\n- Venice has pumped groundwater from beneath the city for industry.\n- Removing groundwater caused the ground itself to sink.\n- Pumping was banned in the 1970s.\n- The sinking slowed but did not reverse; the city sits lower than before.',
    prompt: 'The student wants to explain why banning the pumping did not solve the problem. Which choice best uses the notes to accomplish that goal?',
    choices: [
      'Venice banned the pumping of groundwater in the 1970s after years of industrial use.',
      'Pumping groundwater made the ground sink, and stopping it only slowed that sinking — the city stayed at the lower level it had already reached.',
      'The ground beneath Venice sank because groundwater was removed for industry.',
      'Venice sits lower than it once did, and groundwater pumping has been banned since the 1970s.',
    ],
    answer: 1,
    why: 'The goal is why the ban was not a solution, which needs the sinking and the fact that stopping it did not undo what had happened. Only the second option joins those. The others state the ban, or the cause, or both facts side by side without connecting them.',
  },
  {
    id: 'conv-7',
    section: 'rw',
    domain: 'conventions',
    level: 2,
    passage: 'The oldest surviving map of the region ______ drawn two centuries before the survey ______ hangs in the town hall.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: [', which was, —', ', which was, ,', '— which was —, ', ' which was, '],
    answer: 1,
    why: 'The information between the blanks is extra rather than essential, so it is set off by a matching pair of punctuation marks: a comma before and a comma after. Mixing a comma with a dash leaves the pair mismatched, and leaving the first one out attaches the clause to nothing.',
  },
  {
    id: 'alg-8',
    section: 'math',
    domain: 'algebra',
    level: 2,
    prompt: 'The circumference of a circle is given by C = 2πr. Which equation gives r in terms of C?',
    choices: ['r = 2πC', 'r = C/(2π)', 'r = C − 2π', 'r = 2π/C'],
    answer: 1,
    why: 'To get r on its own, divide both sides by 2π: r = C/(2π). Dividing undoes the multiplication; subtracting 2π would only be right if it had been added rather than multiplied.',
  },
  {
    id: 'adv-8',
    section: 'math',
    domain: 'advanced',
    level: 2,
    prompt: 'What are all the solutions to x² = 49?',
    choices: ['x = 7', 'x = −7', 'x = 7 and x = −7', 'x = 24.5'],
    answer: 2,
    why: 'Both 7² and (−7)² equal 49, so there are two solutions. Taking only the positive square root is the usual slip: the square root symbol means the positive root, but an equation like this has both.',
  },
  {
    id: 'data-8',
    section: 'math',
    domain: 'data',
    level: 2,
    prompt:
      'Six houses on a street sold for $210,000, $225,000, $230,000, $240,000, $250,000 and $2,000,000. Which measure better describes a typical sale price, and why?',
    choices: [
      'The mean, because it uses every value.',
      'The median, because one unusually high price pulls the mean away from the rest.',
      'The mean, because there are an even number of values.',
      'The median, because the values are already in order.',
    ],
    answer: 1,
    why: 'The mean of these is about $525,000, which is higher than five of the six prices — one outlier dragged it up. The median, $235,000, sits among the prices people actually paid. Being in order, or even in count, is not the reason either measure is better.',
  },
  {
    id: 'geo-9',
    section: 'math',
    domain: 'geometry',
    level: 2,
    prompt:
      'Two parallel lines are crossed by a third line. One of the angles formed measures 65 degrees. What is the measure of the angle alternate interior to it, in degrees?',
    accepts: ['65'],
    why: 'Alternate interior angles formed by a line crossing two parallel lines are equal, so it is also 65. The angle next to it on the same line would be the supplement, 115.',
  },

  // ---------- A fourth pass ----------
  {
    id: 'info-7',
    section: 'rw',
    domain: 'information',
    level: 1,
    passage:
      'Before refrigeration, ice was a traded good. Crews cut blocks from frozen New England lakes in winter, packed them in sawdust, and shipped them as far as India, where enough survived the voyage to sell at a profit.',
    prompt: 'Which choice best states the main idea of the text?',
    choices: [
      'Sawdust is an effective insulator for large blocks of ice.',
      'Ice was harvested and shipped long distances as a commercial product before refrigeration existed.',
      'New England lakes froze more reliably in the nineteenth century than they do now.',
      'Most of the ice shipped to India melted before it arrived.',
    ],
    answer: 1,
    why: 'Every sentence serves one point: ice was a product, cut and shipped and sold. The sawdust and the melting are details in service of that, and the text says nothing about how reliably lakes froze.',
  },
  {
    id: 'craft-7',
    section: 'rw',
    domain: 'craft',
    level: 1,
    passage:
      'The report was exhaustive: four hundred pages, every interview transcribed in full, and an appendix listing each document the committee had asked for and not received.',
    prompt: 'As used in the text, what does "exhaustive" most nearly mean?',
    choices: ['Tiring to read', 'Extremely thorough', 'Finally finished', 'Overly critical'],
    answer: 1,
    why: 'The colon lists evidence of completeness — full length, full transcripts, even what was missing — so "exhaustive" means covering everything. "Tiring" is the sense of "exhausting", a different word.',
  },
  {
    id: 'expr-7',
    section: 'rw',
    domain: 'expression',
    level: 1,
    passage:
      'Bamboo is a grass, not a tree. ______ it can grow a metre in a day, which no tree comes close to.',
    prompt: 'Which choice completes the text with the most logical transition?',
    choices: ['However,', 'Partly for that reason,', 'In contrast,', 'Nevertheless,'],
    answer: 1,
    why: 'Being a grass is offered as part of the explanation for the growth rate, so the second sentence follows from the first. The other three all set the sentences against each other, which misreads the relationship.',
  },
  {
    id: 'conv-8',
    section: 'rw',
    domain: 'conventions',
    level: 1,
    passage: 'The theatre kept ______ original ceiling, even after ______ become too fragile to clean.',
    prompt: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ["it's, its", 'its, it had', "its, it's", "it's, it's"],
    answer: 1,
    why: '"Its" with no apostrophe shows possession — the ceiling belongs to the theatre. The second blank needs a subject and verb, "it had", because "it\'s" would read as "it is become". The apostrophe in "it\'s" only ever means "it is" or "it has".',
  },
  {
    id: 'alg-9',
    section: 'math',
    domain: 'algebra',
    level: 2,
    prompt: 'What is the solution to −3x + 5 > 14?',
    choices: ['x > −3', 'x < −3', 'x > 3', 'x < 3'],
    answer: 1,
    why: 'Subtract 5: −3x > 9. Dividing by a negative number turns the inequality round, giving x < −3. Checking x = −4: −3(−4) + 5 = 17, which is greater than 14.',
  },
  {
    id: 'adv-9',
    section: 'math',
    domain: 'advanced',
    level: 2,
    prompt: 'For x ≠ −3, which expression is equivalent to (x² − 9) ÷ (x + 3)?',
    choices: ['x − 3', 'x + 3', 'x² − 3', 'x − 9'],
    answer: 0,
    why: 'x² − 9 is a difference of two squares: (x + 3)(x − 3). Cancelling the (x + 3) leaves x − 3. The condition x ≠ −3 is there because that value would make the original denominator zero.',
  },
  {
    id: 'data-9',
    section: 'math',
    domain: 'data',
    level: 3,
    prompt:
      'Of 50 students surveyed, 30 play a sport. Of those 30, 18 also play an instrument. What percentage of the students who play a sport also play an instrument?',
    choices: ['36%', '60%', '18%', '30%'],
    answer: 1,
    why: 'The question asks within the group that plays a sport, so the 30 is the whole: 18 ÷ 30 = 0.6, or 60%. Dividing by all 50 gives 36%, which answers a different question — what share of everyone surveyed does both.',
  },
  {
    id: 'geo-10',
    section: 'math',
    domain: 'geometry',
    level: 3,
    prompt: 'In a 30-60-90 triangle, the side opposite the 30 degree angle has length 5. What is the length of the hypotenuse?',
    accepts: ['10'],
    why: 'In a 30-60-90 triangle the sides are in the ratio 1 : √3 : 2, with the shortest opposite the 30 degree angle. So the hypotenuse is twice the shortest side: 10. The remaining side is 5√3.',
  },
];

/** Every question that suits a test and the filters chosen, in a stable order. */
export function pickQuestions(options: {
  test: TestId;
  section?: Section | 'both';
  domain?: string | 'all';
}): PrepQuestion[] {
  const levels = levelsFor(options.test);
  return QUESTIONS.filter(
    (question) =>
      levels.includes(question.level) &&
      (!options.section || options.section === 'both' || question.section === options.section) &&
      (!options.domain || options.domain === 'all' || question.domain === options.domain),
  );
}

/**
 * Compares a typed answer generously: spaces, a leading dollar sign, and trailing zeros after a
 * decimal point shouldn't be the reason a student who knew the answer is told they were wrong.
 */
export function typedAnswerMatches(question: PrepQuestion, typed: string): boolean {
  if (!question.accepts) return false;
  const tidy = (text: string) => text.trim().replace(/^\$/, '').replace(/\s+/g, '').replace(/,/g, '');
  const given = tidy(typed);
  if (given === '') return false;
  const asNumber = Number(given);
  return question.accepts.some((accepted) => {
    const want = tidy(accepted);
    if (want === given) return true;
    const wantNumber = Number(want);
    return !Number.isNaN(asNumber) && !Number.isNaN(wantNumber) && asNumber === wantNumber;
  });
}
