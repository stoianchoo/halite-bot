import { Constants } from './hlt/constants';
import { Direction, Position } from './hlt/positionals';
import { Logging } from './hlt/logging';
import { Game } from './hlt/networking';
import { GameMap, Player } from './hlt/gameMap';
import { Ship } from './hlt/entity';

const game = new Game();

interface ShipStatus {
    id: number;
    isReturning: boolean;
}

interface ShipMove {
    direction: Direction;
    ship: Ship;
    from: Position;
    to: Position;
}

let shipStatusArray: ShipStatus[] = [];
let returnAllShips = false;
let shipsCount = 0;

const getCommands = () => {

    const moves: ShipMove[] = [];

    const gameMap = game.gameMap; 
    const me = game.me;
    if(!(gameMap instanceof GameMap) || !(me instanceof Player)) {
        throw "Game not initialized properly!";
    }

    const commandQueue: string[] = [];
    
    const ships = me.getShips();
    
    // Create a new status object if there is a new ship
    const newShipStatusArray = [];
    for(const ship of ships) {
        if(!shipStatusArray[ship.id]) {
            newShipStatusArray[ship.id] = {id:ship.id, isReturning: false};
        } else {
            newShipStatusArray[ship.id] = shipStatusArray[ship.id];
        }
    }
    shipStatusArray = newShipStatusArray; // Hack meant to keep the statuses as array but avoid dificulties with deletion and keeping the indexes
    
    for (const ship of ships) {
    
        // Move avoiding deadlock. In final return ignore ships in the base.
        const move = (destination: Position) => {
            
            const isSafeToMove = (direction: Direction) => {
                const destinationPosition = ship.position.directionalOffset(direction);
                const destinationCell = gameMap.get(destinationPosition);
                const shipCell = gameMap.get(ship.position);
                const isEnoughHaliteToMove = ship.haliteAmount >= Math.floor(shipCell.haliteAmount / Constants.MOVE_COST_RATIO);
                const isDestinationOccupied = destinationPosition.equals(me.shipyard.position) && returnAllShips ? false : destinationCell.isOccupied;
                return  !isDestinationOccupied && isEnoughHaliteToMove;
            };
            
            const selectDirection = (directionsArray: Direction[]) => {
                const safeDirectionsArray = directionsArray.filter(isSafeToMove);
                
                const getRandomArrayElement = (arr: any[]) => arr[Math.floor(arr.length * Math.random())];
                if(safeDirectionsArray.length > 0) {
                    return getRandomArrayElement(safeDirectionsArray);
                }
                return Direction.Still;
            };

            // Try moving toward the destination
            let moveDirection = selectDirection(gameMap.getUnsafeMoves(ship.position, destination));
            
            // If no safe moves towards the destination try other directions
            if(moveDirection === Direction.Still) {
                moveDirection = selectDirection(Direction.getAllCardinals());
            }

                        
//            let moveDirection = gameMap.naiveNavigate(ship, destination); // Marks unsafe
            
            // We want to move but there is a ship there. Possibly a deadlock.
            // FIXME: maybe wait a turn. Now immediately moves in random unoccupied direction.
//            if(moveDirection === Direction.Still) {
//                // For the final phase we have to ingore any ships in the base.
//                // FIXME: Maybe move this in naiveNaviagate? Probably not.
//                if(returnAllShips) {
//                    const shipyardOnNextMoveDirection = Direction.getAllCardinals()
//                        .filter(direction => {
//                            const nextPos = ship.position.directionalOffset(direction);
//                            return nextPos.equals(me.shipyard.position);
//                        })[0];
//                    if(shipyardOnNextMoveDirection) {
//                        moveDirection = shipyardOnNextMoveDirection;
//                    }
//                } 
//                else
//                // Move in random unoccupied direction.
//                {
//                    const possibleDirections = Direction.getAllCardinals().filter(dir => {
//                        const destinationPosition = ship.position.directionalOffset(dir);
//                        const destinationCell = gameMap.get(destinationPosition);
//                        return !destinationCell.isOccupied || (ship.halite >= Math.floor(destinationCell.haliteAmount/Constants.MOVE_COST_RATIO)); // Ensure enough halite to move
//                    });
//                    
//                    const getRandomArrayElement = arr => 
//                        arr[Math.floor(arr.length * Math.random())];
//    
//                    if(possibleDirections.length > 0) {
//                        moveDirection = getRandomArrayElement(possibleDirections);
//                    }
//                }
//            }

            // Issue the move
            if(moveDirection !== Direction.Still) {   
                // Mark the current ship position as safe (free) as the ship will move to another position.
                // Push the move to a list where at the end we can order the moves to avoid collisions based on wrong order
                const from = ship.position;
                const to = ship.position.directionalOffset(moveDirection);
                
                // Mark positions
                gameMap.get(to).ship = ship;
                gameMap.get(from).ship = null;
    
                moves.push({ship, direction:moveDirection, from, to});
            }
        };

    
        // -------------------------------------
        // RETURN TO SHIPYARD
        // -------------------------------------
        
        // Reset the returning flag at the shipyard unless it is the final phase of all returning ships to base
        if(!returnAllShips && ship.position.equals(me.shipyard.position)) {
            shipStatusArray[ship.id].isReturning = false;
        }

        // Return if we have enough cargo
        if (!shipStatusArray[ship.id].isReturning && (ship.haliteAmount > Constants.MAX_ENERGY * 0.9)) {
            shipStatusArray[ship.id].isReturning = true;
        }

        if (shipStatusArray[ship.id].isReturning && !ship.position.equals(me.shipyard.position)) {
            // Do the return move
            move(me.shipyard.position);
        }
        
        // -------------------------------------
        // GATHER HALITE
        // -------------------------------------
        else if (!returnAllShips && gameMap.get(ship.position).haliteAmount < Constants.MAX_ENERGY * 0.05) {
            // Collect halite
            let bestPosition = ship.position;
            for(const direction of Direction.getAllCardinals()) {
                // Select the next richiest position (TODO: increase range)
                
                let nextPosition = ship.position.directionalOffset(direction);
                if(gameMap.get(bestPosition).haliteAmount < gameMap.get(nextPosition).haliteAmount) {
                    bestPosition = nextPosition;
                } 

            }

            if(ship.position !== bestPosition) {
                // Move to the new position
                move(bestPosition);
            }

        }
    } // while loop

    // !!!! Do this next
    // Spawn new ships
    // FIXME: Base this on the map size number of players and total halite on the map
    // FIXME: add some dynamic ship creation depending on ship loss due to war or accident
    
    let alreadySpawned = false;
    const spawnShip = () => {
        if(!alreadySpawned && me.haliteAmount >= Constants.SHIP_COST && !gameMap.get(me.shipyard).isOccupied) {
            commandQueue.push(me.shipyard.spawn());
            alreadySpawned = true;
        }
    };

    
    const isAfterGameProgress = (coeff: number) => game.turnNumber < coeff * Constants.MAX_TURNS;
    if (isAfterGameProgress(0.5)) {
        spawnShip();
    }
    
    // Recover from killed ships
    if((!returnAllShips) && (shipsCount > ships.length) && !isAfterGameProgress(0.7)) {
        spawnShip();
    }
    shipsCount = ships.length;
    
    // FIXME: the endphase calculation magic number and logic
    // for each ship if return turns is equal to rest game turns initiate final return to base (with some reserve for deadlock maybe)
    // Max ship distance to base
    const maxShipDistanceToShipyard = Math.max(...ships.map(aShip => gameMap.calculateDistance(me.shipyard.position, aShip.position)));
    
    // Use for turning of and on features
    // Weak calculation
    // const leftTurnsToReturnAll = Math.max(gameMap.width/2, gameMap.height/2);

    const deadlockMovesReserve = 3 + (gameMap.width + gameMap.height)/20;
    if(!returnAllShips && (Constants.MAX_TURNS - game.turnNumber < (maxShipDistanceToShipyard + deadlockMovesReserve))) {
        returnAllShips = true;
        shipStatusArray.forEach(shipStatus => {
            shipStatus.isReturning = true;
        });
    }
    
//    logging.info("isReturning:", shipStatusArray.filter(s => s.isReturning).map(s => s.id).join(','),
//        "lens", ships.map(aShip => gameMap.calculateDistance(me.shipyard.position, aShip.position)).join(','));
    
//    logging.info("Moves raw:", moves.map(m => m.ship.id + " to:" + m.to.x+","+m.to.y+" from:"+m.from.x+","+m.from.y).join(";"));
//    
//    
//    // -------------------------
//    // REORDER MOVES
//    // -------------------------
//    
//    // Reorder the moves to avoid collisions
//    // FIXME: mind the spawns
//
//    for(let i = 0; i < moves.length - 1; i++) {
//        while (true) {
//            // Search for a collision and swap if any
//            let isCollision = false;
//            for(let j = i + 1; j < moves.length; j++) {
//                if(moves[i].to.equals(moves[j].from)) {
//                    // swap
//                    let tmpMove = moves[i];
//                    moves[i] = moves[j];
//                    moves[j] = tmpMove;
//                    
//                    isCollision = true;
//                    break;
//                }
//            }
//            
//            if(!isCollision) {
//                break;
//            }
//        }
//    }
//    
//    logging.info("Moves ord:", moves.map(m => m.ship.id + " to:" + m.to.x+","+m.to.y+" from:"+m.from.x+","+m.from.y).join(";"));
    
    // Issue the actual move commends.
    for(let move of moves) {
        commandQueue.push(move.ship.move(move.direction));
    }

//    logging.info("commands: ",commandQueue);

    
    return commandQueue;
};

game.initialize().then(async () => {
    await game.ready('MyJavaScriptBot');

    Logging.info(`My Player ID is ${game.myId}.`);

    while (true) {
        await game.updateFrame();
        await game.endTurn(getCommands());
    }
});
