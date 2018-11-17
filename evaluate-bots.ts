// Run this and pipe the output to a .bat file to add variants to the manager for evaluation

// ------------------------------------CONFIG-------------------------------------------

const managerCmd = 'python .\\manager\\manager.py';
const botCmd = 'node .\\out\\MyBot.js'
const variables: Variable[] = [
    { name: 'f', from: 0.7, to: 0.9, step: 0.1, description: 'fill threshold' },
    { name: 'g', from: 0.02, to: 0.05, step: 0.01, description: 'gather until' },
    { name: 's', from: 0.4, to: 0.7, step: 0.1, description: 'spawn phase' },
];

// -----------------------------------------------------------------------------------

interface Variable {
    name: string;
    from: number;
    to: number;
    step: number;
    description: string;
}

interface Parameter {
    name: string;
    parameter: string;
}

const botParameters = variables.map(v => {
    const result = [];
    for (let i = v.from; i <= v.to; i = i + v.step) {
        result.push({ name: v.name + ':' + i.toFixed(2), parameter: String(i.toFixed(2)) });
    }
    return result;
}).reduce((result: Parameter[], newParameters: Parameter[], i) => {
    const result1 = result.map(variant => {
        const result2 = newParameters.map(newParameter => {
            return { 
                name: variant.name + ' ' + newParameter.name, 
                parameter: variant.parameter + ' ' + newParameter.parameter
            };
        });
        return result2;
    }).reduce((acc, val) => acc.concat(val), []);
    if(i == 0) {
        return newParameters;
    } else {
        return result1;
    }
}, []);

console.log(managerCmd + ' --reset');
botParameters.map(p => 
    managerCmd + ' -A "' + 
    p.name + 
    '" -p ' + botCmd + ' ' + 
    p.parameter + '"'
).forEach(l => console.log(l));
