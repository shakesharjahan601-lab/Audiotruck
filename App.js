import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, PanResponder } from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

export default function App() {
  // Game States
  const [gameState, setGameState] = useState('menu'); 
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  
  // Player & World Data
  const player = useRef({ x: 5, y: 5, facing: 0 }); // facing: 0=North, 1=East, 2=South, 3=West
  const roomBounds = { minX: 0, maxX: 15, minY: 0, maxY: 15 };
  
  // Audio Refs
  const audioRefs = useRef({});
  const lastTapRef = useRef(0);
  const tapCount = useRef(0);
  const swipeSequence = useRef([]);

  const menuItems = ['Play Game', 'Settings', 'Exit'];

  // --- AUDIO HELPER FUNCTIONS ---
  const playSound = async (name, loop = false, pan = 0, volume = 1.0) => {
    try {
      const fileMap = {
        'swipe': require('./swipe.mp3'),
        'click': require('./click.mp3'),
        'footstep': require('./footstep.mp3'),
        'carkeys': require('./carkeys.mp3'),
        'carkeyspickup': require('./carkeyspickup.mp3'),
        'doortheir': require('./doortheir.mp3'),
        'dooropen': require('./dooropen.mp3'),
        'doorclose': require('./doorclose.mp3'),
        'atmosphere': require('./atmosphere.mp3'),
        'cartheir': require('./cartheir.mp3'),
        'getting': require('./getting.mp3'),
        'carstarting': require('./carstarting.mp3'),
      };
      
      if (!fileMap[name]) return;

      const { sound } = await Audio.Sound.createAsync(fileMap[name], {
        isLooping: loop,
        shouldPlay: true,
        pan: pan,
        volume: volume
      });
      
      if (loop) audioRefs.current[name] = sound;
      
    } catch (error) {
      console.log(`Error playing ${name}:`, error);
    }
  };

  const stopSound = async (name) => {
    if (audioRefs.current[name]) {
      await audioRefs.current[name].stopAsync();
      await audioRefs.current[name].unloadAsync();
      audioRefs.current[name] = null;
    }
  };

  const speak = (text) => {
    Speech.stop(); 
    Speech.speak(text, { rate: 0.9, pitch: 1.0 });
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    speak("Main Menu. " + menuItems[0] + ". Swipe right to explore, double tap to select.");
    return () => { Object.keys(audioRefs.current).forEach(stopSound); };
  }, []);

  // --- 3D AUDIO PANNING MATH ---
  const updateBeaconAudio = (targetX, targetY, audioName) => {
    if (!audioRefs.current[audioName]) return;
    
    const dx = targetX - player.current.x;
    const dy = targetY - player.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const volume = Math.max(0.2, 1.0 - (distance / 20));
    
    let angleToTarget = Math.atan2(dy, dx) * (180 / Math.PI);
    let facingAngle = [90, 0, -90, 180][player.current.facing]; 
    
    let angleDiff = angleToTarget - facingAngle;
    while (angleDiff <= -180) angleDiff += 360;
    while (angleDiff > 180) angleDiff -= 360;
    
    let pan = Math.max(-1.0, Math.min(1.0, angleDiff / 90));
    
    audioRefs.current[audioName].setPanAsync(pan);
    audioRefs.current[audioName].setVolumeAsync(volume);
  };

  // --- MOVEMENT LOGIC ---
  const movePlayer = (direction) => {
    playSound('footstep');
    let { x, y, facing } = player.current;

    if (direction === 'forward') {
      if (facing === 0) y += 1;
      if (facing === 1) x += 1;
      if (facing === 2) y -= 1;
      if (facing === 3) x -= 1;
    } else if (direction === 'backward') {
      if (facing === 0) y -= 1;
      if (facing === 1) x -= 1;
      if (facing === 2) y += 1;
      if (facing === 3) x += 1;
    }

    if (x < roomBounds.minX || x > roomBounds.maxX || y < roomBounds.minY || y > roomBounds.maxY) {
      speak("You hit a wall. You cannot go that way.");
      return false; 
    }

    player.current.x = x;
    player.current.y = y;
    return true; 
  };

  const turnPlayer = (direction) => {
    // UI swipe sounds are completely removed from in-game turning
    if (direction === 'left') {
      player.current.facing = (player.current.facing + 3) % 4;
    } else if (direction === 'right') {
      player.current.facing = (player.current.facing + 1) % 4;
    }
  };

  // --- GAME LOGIC STATE MACHINE ---
  const handleGameAction = (action, touches = 1) => {
    const s = gameState;

    if (s === 'must_close_door') {
      if (action === 'swipe_up' && touches === 2) {
        playSound('doorclose');
        playSound('atmosphere', true);
        speak("Door closed. You are hearing a sound; you need to walk toward it.");
        playSound('cartheir', true); 
        setGameState('goto_truck');
      } else {
        speak("First, close the door. Swipe up with two fingers.");
      }
      return;
    }

    if (s === 'warning' && action === 'double_tap') {
      setGameState('intro');
      speak("Your name is Sean, and you are in your home. Double tap to continue.");
    } 
    else if (s === 'intro' && action === 'double_tap') {
      setGameState('tutorial_move');
      speak("To move forward, swipe your finger upwards. Try it now.");
    }
    else if (s === 'tutorial_move' && action === 'swipe_up') {
      playSound('footstep');
      setGameState('tutorial_turn');
      speak("Good. To turn, swipe left or right. Try to turn left.");
    }
    else if (s === 'tutorial_turn' && action === 'swipe_left') {
      setGameState('search_keys');
      speak("Good. To collect an item, double-tap in the middle of the screen. Try it now to find your keys.");
    }
    else if (s === 'search_keys' && action === 'double_tap') {
      setGameState('goto_keys');
      playSound('carkeys', true);
      player.current.facing = 0;
      player.current.x = 5; player.current.y = 5; 
      updateBeaconAudio(5, 11, 'carkeys'); 
    }
    else if (s === 'goto_keys') {
      if (action === 'swipe_left') turnPlayer('left');
      if (action === 'swipe_right') turnPlayer('right');
      if (action === 'swipe_up') {
        if(movePlayer('forward')) {
           updateBeaconAudio(5, 11, 'carkeys');
           if (player.current.x === 5 && player.current.y === 11) {
             stopSound('carkeys');
             playSound('carkeyspickup');
             setGameState('goto_door');
             speak("Keys collected. To go outside, you need to head in the direction of the door sound.");
             playSound('doortheir', true);
             updateBeaconAudio(15, 11, 'doortheir');
           }
        }
      }
    }
    else if (s === 'goto_door') {
      if (action === 'swipe_left') turnPlayer('left');
      if (action === 'swipe_right') turnPlayer('right');
      if (action === 'swipe_up') {
        if(movePlayer('forward')) {
           updateBeaconAudio(15, 11, 'doortheir');
           if (player.current.x === 15 && player.current.y === 11) {
             stopSound('doortheir');
             setGameState('open_door');
             speak("To open the door, swipe down with two fingers.");
           }
        }
      }
    }
    else if (s === 'open_door' && action === 'swipe_down' && touches === 2) {
      playSound('dooropen');
      setGameState('door_opened_step1');
      speak("Swipe up to walk outside.");
    }
    else if (s === 'door_opened_step1' && action === 'swipe_up') {
      playSound('footstep');
      setGameState('door_opened_step2');
    }
    else if (s === 'door_opened_step2' && action === 'swipe_up') {
      playSound('footstep');
      setGameState('must_close_door');
      speak("To close the door, swipe up with two fingers.");
    }
    else if (s === 'goto_truck') {
      if (action === 'swipe_left') turnPlayer('left');
      if (action === 'swipe_right') turnPlayer('right');
      if (action === 'swipe_up') {
        movePlayer('forward'); 
        updateBeaconAudio(15, 25, 'cartheir'); 
        if (player.current.y >= 23) { 
           stopSound('cartheir');
           setGameState('enter_truck');
           speak("To get into the truck, triple-tap the screen.");
        }
      }
    }
    else if (s === 'enter_truck' && action === 'triple_tap') {
      playSound('getting');
      setGameState('start_truck');
      speak("You already have your truck keys. To start the truck, swipe left and right continuously with one finger.");
    }
    else if (s === 'start_truck') {
      if (action === 'swipe_left') {
        swipeSequence.current.push('L');
      } else if (action === 'swipe_right') {
        swipeSequence.current.push('R');
        if (swipeSequence.current.join('') === 'LR') {
          playSound('carstarting');
          setGameState('game_won');
          speak("Engine started. Great job.");
        }
        if (swipeSequence.current.length > 2) swipeSequence.current = [];
      }
    }
  };

  // --- GESTURE RESPONDER ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        const touches = evt.nativeEvent.touches.length || 1; 
        const isMenu = gameState === 'menu';
        
        if (Math.abs(dx) > 50 || Math.abs(dy) > 50) {
          // Swipe sound ONLY plays if we are in the main menu
          if (isMenu) playSound('swipe');
          
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
              if (isMenu) navigateMenu(1);
              else handleGameAction('swipe_right', touches);
            } else {
              if (isMenu) navigateMenu(-1);
              else handleGameAction('swipe_left', touches);
            }
          } else {
            if (dy > 0) handleGameAction('swipe_down', touches); 
            else handleGameAction('swipe_up', touches); 
          }
          return;
        }

        const now = Date.now();
        const DELAY = 400;
        
        if (now - lastTapRef.current < DELAY) {
          tapCount.current += 1;
        } else {
          tapCount.current = 1;
        }
        lastTapRef.current = now;

        setTimeout(() => {
          if (tapCount.current === 2) {
            if (isMenu) {
              // Click sound ONLY plays if we are in the main menu
              playSound('click');
              activateMenu();
            } else {
              handleGameAction('double_tap');
            }
            tapCount.current = 0;
          } else if (tapCount.current === 3) {
            handleGameAction('triple_tap');
            tapCount.current = 0;
          }
        }, DELAY + 50);
      },
    })
  ).current;

  // --- MENU HELPERS ---
  const navigateMenu = (dir) => {
    let newIndex = (focusedMenuIndex + dir + menuItems.length) % menuItems.length;
    setFocusedMenuIndex(newIndex);
    speak(menuItems[newIndex]);
  };

  const activateMenu = () => {
    if (menuItems[focusedMenuIndex] === 'Play Game') {
      setGameState('warning');
      speak("Note: In this game, TalkBack should not be used. Please rely on the inbuilt screen reader. Double tap the screen to continue.");
    } else {
      speak(menuItems[focusedMenuIndex] + " selected. Not ready yet.");
    }
  };

  // --- RENDERING ---
  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {gameState === 'menu' ? (
        <>
          <Text style={styles.hiddenText}>Main Menu. Swipe to navigate.</Text>
          <Text style={styles.visualText}>{menuItems[focusedMenuIndex]}</Text>
        </>
      ) : (
        <Text style={styles.hiddenText}>Game Active. State: {gameState}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenText: {
    color: '#333',
    padding: 20,
    textAlign: 'center',
  },
  visualText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
  }
});
