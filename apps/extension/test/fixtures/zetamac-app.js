function rand(n) {
    return Math.floor(Math.random() * n);
}
export function init(options) {
    let problemStartTime;
    const game = $('#game');
    const d_left = game.find('.left');
    const correct = game.find('.correct');
    const banner = game.find('.banner');
    const problem = game.find('.problem');
    const answer = game.find('.answer');
    answer.focus();
    const wls = window.location.search;
    function randGen(min, max) {
        return function () {
            return min + rand(max - min + 1);
        };
    }
    const genTypes = ['add_left', 'add_right', 'mul_left', 'mul_right'];
    const randGens = {};
    genTypes.forEach(function (type) {
        randGens[type] = randGen(options[`${type}_min`], options[`${type}_max`]);
    });
    function pg_add() {
        const left = randGens[genTypes[0]]();
        const right = randGens[genTypes[1]]();
        return {
            prettyProblem: left + ' + ' + right,
            plainProblem: left + ' + ' + right,
            answer: left + right,
        };
    }
    function pg_sub() {
        const first = randGens[genTypes[0]]();
        const second = randGens[genTypes[1]]();
        const left = first + second;
        const right = first;
        return {
            prettyProblem: left + ' \u2013 ' + right,
            plainProblem: left + ' - ' + right,
            answer: left - right,
        };
    }
    function pg_mul() {
        const left = randGens[genTypes[2]]();
        const right = randGens[genTypes[3]]();
        return {
            prettyProblem: left + ' \xD7 ' + right,
            plainProblem: left + ' * ' + right,
            answer: left * right,
        };
    }
    function pg_div() {
        const first = randGens[genTypes[2]]();
        const second = randGens[genTypes[3]]();
        if (first !== 0) {
            const left = first * second;
            const right = first;
            return {
                prettyProblem: left + ' \xF7 ' + right,
                plainProblem: left + ' / ' + right,
                answer: left / right,
            };
        }
    }
    const pgs = [];
    if (options.add) {
        pgs.push(pg_add);
    }
    if (options.sub) {
        pgs.push(pg_sub);
    }
    if (options.mul) {
        pgs.push(pg_mul);
    }
    if (options.div) {
        pgs.push(pg_div);
    }
    function problemGen() {
        let genned;
        while (genned == null) {
            genned = pgs[rand(pgs.length)]();
        }
        return genned;
    }
    let genned;
    let thisProblemLog;
    function problemGeng() {
        genned = problemGen();
        thisProblemLog = {
            problem: genned.plainProblem,
            answer: genned.answer,
            entry: [],
            timeMs: -1,
        };
        problem.text(genned.prettyProblem);
        answer.val('');
    }
    const startTime = (problemStartTime = Date.now());
    let correct_ct = 0;
    const problemLog = [];
    answer.on('input', function (e) {
        const value = e.currentTarget.value;
        if (thisProblemLog.entry) {
            const lastEntry = thisProblemLog.entry[thisProblemLog.entry.length - 1] ?? '';
            if (value.length - lastEntry.length > 1 || // paste
                /[^-\d\s]/.test(value) || // non-numeric
                lastEntry.length >= 2 + String(genned.answer).length // too long
            ) {
                thisProblemLog.entry = null;
            }
            else {
                thisProblemLog.entry.push(value);
            }
        }
        if (value.trim() === String(genned.answer)) {
            const now = Date.now();
            thisProblemLog.timeMs = now - problemStartTime;
            problemLog.push(thisProblemLog);
            problemStartTime = now;
            problemGeng();
            correct.text('Score: ' + ++correct_ct);
        }
        return true;
    });
    problemGeng();
    const duration = options.duration || 120;
    d_left.text('Seconds left: ' + duration);
    const timer = setInterval(function () {
        const d = duration - Math.floor((Date.now() - startTime) / 1000);
        d_left.text('Seconds left: ' + d);
        if (d <= 0) {
            problemLog.push(thisProblemLog);
            answer.prop('disabled', true);
            const $doc = $(window.document);
            const bsEat = function bsEat(e) {
                return e.keyCode !== 8;
            };
            $doc.on('keydown', bsEat);
            clearInterval(timer);
            $.post('/log', {
                key: wls.match(/key=([0-9a-f]{8})/)?.[1],
                problemLog: JSON.stringify(problemLog),
            }, function () {
                setTimeout(function () {
                    return $doc.off('keydown', bsEat);
                }, 1000);
                banner.find('.start').hide();
                return banner.find('.end').show();
            }, 'html');
        }
    }, 1000);
    if (wls.match(/\bpink\b/)) {
        $('.banner').css('background', 'pink');
    }
}
