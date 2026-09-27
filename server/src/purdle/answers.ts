/**
 * Purdle's answers: 1208 common five-letter words picked by hand for
 * the game (2026-09-27), about three years of days. No plurals, nothing
 * obscure, nothing crude. Every one is also a valid guess
 * (`@scryproof/shared/purdle-words`).
 *
 * Kept on the server only. Alphabetical here; the day's word comes from an
 * order shuffled with a server secret (`purdle.ts`), so reading this list
 * says nothing about tomorrow. Adding or removing a word reshuffles the
 * whole order, today included, so do it between days and rarely.
 */

const RUN =
  'aboutaboveabuseactoracuteadaptadoptadultafteragainagentagreeaheadalarmalbumalert' +
  'alienalignalikealiveallowalonealongalteramberamendamongampleangelangerangleangry' +
  'ankleapartappleapplyapronarenaarguearisearmoraromaarrayarrowasideassetatlasattic' +
  'audioauditavoidawakeawardawareawfulbaconbadgebadlybagelbakerbasicbasinbasisbatch' +
  'beachbeardbeastbeginbeingbellybelowbenchberrybirthblackbladeblameblandblankblast' +
  'blazebleakblendblessblindblinkblissblockblondbloodbloomblownbluesbluffbluntblurt' +
  'blushboardboastbonusboostboothboredboundbrainbrakebrandbrassbravebreadbreakbreed' +
  'brickbridebriefbringbrinkbriskbroadbrokebrookbroombrownbrushbuddybuildbuiltbulky' +
  'bunchbunnyburstcabincablecacaocamelcandycanoecargocarrycarvecatchcausecedarchain' +
  'chairchalkchampchantchaoscharmchartchasecheapcheatcheckcheekcheerchesschestchick' +
  'chiefchildchillchimechoirchordchorechunkcidercigarciviccivilclaimclampclashclasp' +
  'classcleanclearclerkclickcliffclimbclingcloakclockclonecloseclothcloudclowncoach' +
  'coastcobracocoacoloncolorcometcomiccoralcouchcoughcouldcountcourtcovercrackcraft' +
  'cranecrashcratecrawlcrazycreamcreekcrestcrispcroakcrookcrosscrowdcrowncrudecruel' +
  'crumbcrushcrustcubiccurvecycledailydairydaisydancedealtdeathdebutdecaydecordecoy' +
  'delaydeltadensedepotdepthderbydevildiarydigitdinerdirtyditchdiverdizzydodgedoing' +
  'donordonutdoubtdoughdozendraftdraindramadrankdrapedrawndreaddreamdressdrieddrift' +
  'drilldrinkdrivedrolldronedrowndryerdustydwarfdwelleagereagleearlyeartheaseleaten' +
  'ebonyedicteerieeightelbowelderelecteliteelopeeludeemberemptyenactenemyenjoyenter' +
  'entryequalequiperaseerroreruptessayeventeveryexactexileexistextrafablefacetfaint' +
  'fairyfaithfalsefancyfaultfavorfeastfenceferryfetchfeverfewerfiberfieldfieryfifth' +
  'fiftyfightfinalfirstflailflairflameflankflareflashflaskfleetfleshflickflingflint' +
  'floatflockfloodfloorfloraflourfluidflungflushflutefocalfocusfoggyfollyforceforge' +
  'forthfortyforumfoundframefrankfraudfreakfreshfriedfrillfriskfrockfrontfrostfroth' +
  'frozefruitfudgefullyfungifunnyfuzzygaugegeckogenreghostgiantgiddygivengizmoglade' +
  'glandglareglassgleamglideglintgloomgloryglossglovegnomegoosegorgegracegradegrain' +
  'grandgrantgrapegraphgraspgrassgravegravygrazegreatgreedgreengreetgriefgrillgrime' +
  'grindgroangroomgrossgroupgrovegrowlgrownguardguessguestguideguildguiltguisegummy' +
  'gustohabithappyhardyharshhastyhatchhaunthavenheartheavyhedgeheisthellohenceheron' +
  'hippohitchhobbyhoisthollyhomerhoneyhonorhorsehotelhoundhousehoverhumanhumidhumor' +
  'hunchhurryhuskyhypericingidealidiomiglooimageimplyindexinnerinputironyisletissue' +
  'itchyivoryjazzyjellyjeweljointjokerjollyjudgejuicejuicyjumbojumpykayakkebabkiosk' +
  'knackkneadknifeknockknownkoalalabellaborladlelancelargelaserlatchlaterlaughlayer' +
  'leafylearnleaseleastleaveledgelegallemonlevelleverlightlilaclimitlinenlinerlingo' +
  'llamalobbylocallodgeloftylogiclooselotusloverlowerloyalluckylunarlunchlyinglyric' +
  'macawmagicmajormakermangomanormaplemarchmarrymarshmatchmayormeantmedalmediamelon' +
  'mercymeritmerrymessymetalmetermidstmightmimicminceminormintyminusmirthmisermixer' +
  'modelmoistmolarmoneymonthmoodymoosemoralmotelmotormottomoundmountmournmousemouth' +
  'moviemuddymuralmusicmustynaivenannynastynavalnervenevernewlynichenightninjanoble' +
  'noisenorthnotchnovelnudgenursenuttynylonoasisoceanofferoftenoliveomegaoniononset' +
  'operaorbitorderorganotherotteroughtounceouterovertowneroxideozonepaddypaintpanda' +
  'panelpanicpaperparkapartypastapastepatchpatiopausepeachpearlpedalpennyperchperil' +
  'perkypeskypetalphasephonephotopianopiecepilotpinchpixelpizzaplaceplaidplainplane' +
  'plankplantplateplazapleadpleatpluckplumbplumeplumpplushpointpoisepolarpolkaporch' +
  'pouchpoundpowerprankpresspriceprideprimeprintpriorprismprizeprobeproneproofprose' +
  'proudproveprowlproxyprunepsalmpulsepunchpupilpuppypursequackquakequartqueenquery' +
  'questqueuequickquietquiltquirkquitequotaquoteradarradiorainyraiserallyranchrange' +
  'rapidravenreachreactreadyrealmrebelreferreignrelaxrelayrelicremixrenewrepayreply' +
  'rhinorhymeridgeriflerightrigidrinseripenrisenriskyrivalriverroastrobinrobotrocky' +
  'rodeorogueroomyroostrougeroughroundrouteroverroyalrugbyrulerrumorruralrustysadly' +
  'saintsaladsalonsalsasaltysandysatinsaucesaunasavorscalescalpscarescarfscaryscene' +
  'scentsconescoopscopescorescoutscrapscrubsedanseizesenseservesetupsevensevershade' +
  'shadyshaftshakeshakyshallshameshapesharesharksharpshaveshawlsheepsheersheetshelf' +
  'shellshiftshineshinyshirtshockshoreshortshoutshoveshowyshrubshrugsiegesightsigma' +
  'silkysillysincesirensixthsixtyskateskierskillskirtskullslatesleeksleepsleetslept' +
  'sliceslideslimeslopeslothsmartsmashsmellsmilesmirksmithsmokesnacksnailsnakesnare' +
  'sneaksniffsnoresnowysoapysobersolarsolidsolvesonicsorrysoundsouthspacespadespare' +
  'sparkspawnspeakspearspeedspellspendspentspicespicyspikespillspinespitesplatsplit' +
  'spoilspokespoonsportspoutsprayspreesquadsquidstackstaffstagestainstairstakestale' +
  'stalkstallstampstandstarestarkstartstashstatesteakstealsteamsteelsteepsteerstern' +
  'stickstiffstillstingstinkstockstompstonestoodstoolstoopstorestorkstormstorystout' +
  'stovestrawstraystripstuckstudystuffstumpstungstuntstylesugarsuitesunnysupersurge' +
  'swampswarmswearsweatsweepsweetswellsweptswiftswirlswordsworeswornsyruptabletaboo' +
  'tackytaffytakentallytalontangotangytapertardytastetastytauntteachtearyteddyteeth' +
  'tempotenthtepidthankthefttheirthemetherethickthiefthighthingthinkthirdthornthose' +
  'threethrewthrowthumbthumptigertighttimertimidtipsytiredtitletoasttodaytokentonic' +
  'toothtopictorchtotaltouchtoughtoweltowertoxictracetracktradetrailtraintraittramp' +
  'trashtreadtreattrendtrialtribetricktriedtrolltrooptrouttrucetrucktrulytrunktrust' +
  'truthtuliptummytunertunicturbotutortwangtweaktweedtwicetwinetwirltwistudderulcer' +
  'ultrauncleunderundidunfitunifyunionuniteunityuntieuntilupperupseturbanusageusher' +
  'usualuttervaguevalidvaluevalvevaporvaultveganvenomvenuevergeversevideovigorvinyl' +
  'violaviperviralvirusvisitvisorvitalvividvocalvodkavoicevotervouchvowelwackywafer' +
  'wagerwagonwaistwaltzwastewatchwaterwearyweavewedgeweighweirdwhalewheatwheelwhere' +
  'whichwhilewhinewhirlwhiskwhitewholewhosewidenwidowwidthwieldwincewindywitchwitty' +
  'wokenwomanworldworryworseworstworthwouldwoundwovenwrathwreckwristwritewrongwrote' +
  'yachtyearnyeastyieldyoungyouthzebrazesty';

export const ANSWERS: readonly string[] = Array.from({ length: RUN.length / 5 }, (_, at) => RUN.slice(at * 5, at * 5 + 5));
