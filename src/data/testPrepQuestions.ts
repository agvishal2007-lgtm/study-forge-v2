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
