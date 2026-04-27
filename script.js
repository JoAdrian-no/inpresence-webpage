/**
 * script.js
 * 3D Particle Sphere using Three.js
 * 
 * Features:
 * - 1000 glowing particles arranged in a sphere
 * - Smooth rotation animation
 * - Mouse interaction for rotation
 * - Additive blending for glow effect
 * - Responsive canvas
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        particleCount: 5000,        // Number of particles (500-1500)
        sphereRadius: 2,            // Radius of the sphere
        particleSize: 0.04,        // Base size of each particle
        rotationSpeed: 0.01,       // Base rotation speed
        mouseInfluence: 0.05,       // How much mouse affects rotation
        particleColor: 0x00ffff,   // Cyan color for particles
        glowIntensity: 1.5,        // Glow strength
        backgroundColor: 0x0066ff,  // Dark background
        disturbanceRadius: 1.5,    // Radius of mouse disturbance field
        disturbanceStrength: 0.5,  // Strength of particle displacement
        disturbanceFalloff: 0.5,    // How fast disturbance fades
        mouseDelay: 0.1,            // Delay factor for disturbance (0 = no delay, 1 = max delay)
        
        // Vaporwave background settings
        vaporwaveSpeed: 0.005,       // Speed of color shift
        vaporwaveColors: [          // Gradient colors (top to bottom)
            0xff71ce, // Pink/Magenta
            0x01cdfe, // Cyan
            0x05ffa1, // Mint green
            0xb967ff  // Purple
        ],
        vaporwaveStops: [0.0, 0.25, 0.5, 0.75, 1.0, 1.0, 1.0] // 5 stops + padding for uniform array
    };

    // ============================================
    // GLOBAL VARIABLES
    // ============================================
    let scene, camera, renderer, particles;
    let mouseX = 0, mouseY = 0;
    let mouse3D = new THREE.Vector3(0, 0, 0);  // Current mouse position in 3D space
    let delayedMouse3D = new THREE.Vector3(0, 0, 0);  // Delayed mouse for trail effect
    let targetRotationX = 0, targetRotationY = 0;
    let windowHalfX, windowHalfY;

    // ============================================
    // INITIALIZATION
    // ============================================
    
    /**
     * Initialize the Three.js scene
     */
    function init() {
        // Get window dimensions
        windowHalfX = window.innerWidth / 2;
        windowHalfY = window.innerHeight / 2;

        // Create scene (transparent for vaporwave background)
        scene = new THREE.Scene();

        // Create camera (perspective)
        camera = new THREE.PerspectiveCamera(
            75, // Field of view
            window.innerWidth / window.innerHeight, // Aspect ratio
            0.1, // Near plane
            1000 // Far plane
        );
        camera.position.z = 5;

        // Create renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true, // Smooth edges
            alpha: false
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Add canvas to container
        document.getElementById('canvas-container').appendChild(renderer.domElement);

        // Create vaporwave gradient background
        createVaporwaveBackground();

        // Create particle system
        createParticles();

        // Add event listeners
        addEventListeners();

        // Start animation loop
        animate();
    }

    /**
     * Create vaporwave gradient background that shifts vertically
     */
    function createVaporwaveBackground() {
        // Create a large plane for the background
        const bgGeometry = new THREE.PlaneGeometry(100, 100);
        const bgMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uSpeed: { value: CONFIG.vaporwaveSpeed },
                uStops: { value: CONFIG.vaporwaveStops }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uSpeed;
                uniform float uStops[7];
                varying vec2 vUv;
                
                // Helper: smooth blend between two colors
                vec3 blend(vec3 a, vec3 b, float t, float width) {
                    float s = smoothstep(0.0, 1.0, t / width);
                    return mix(a, b, s);
                }
                
                void main() {
                    float y = mod(vUv.y + uTime * uSpeed, 1.0);
                    vec3 c0 = vec3(1.0, 0.44, 0.81); // Pink/Magenta
                    vec3 c1 = vec3(0.01, 0.80, 0.99); // Cyan
                    vec3 c2 = vec3(0.02, 1.0, 0.63); // Mint green
                    vec3 c3 = vec3(0.73, 0.40, 1.0); // Purple

                    vec3 colors[5];
                    colors[0] = c0;
                    colors[1] = c1;
                    colors[2] = c2;
                    colors[3] = c3;
                    colors[4] = c0; // Loop back for seamless wrap
                    float width = 0.4; // Blend width
                    vec3 color = colors[0];
                    for (int i = 0; i < 4; i++) {
                        float t = clamp((y - uStops[i]) / (uStops[i+1] - uStops[i]), 0.0, 1.0);
                        color = blend(color, colors[i+1], t, width);
                    }
                    float scanline = sin(vUv.y * 400.0) * 0.03;
                    color -= scanline;
                    float vignette = 1.0 - length((vUv - 0.5) * 1.5);
                    color *= vignette;
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const background = new THREE.Mesh(bgGeometry, bgMaterial);
        background.position.z = -20;
        scene.add(background);
        scene.userData.background = background;
    }

    /**
     * Create the particle sphere with custom shader for disturbance effect
     */
    function createParticles() {
        // Geometry to hold particle positions
        const geometry = new THREE.BufferGeometry();
        
        // Arrays to store position data
        const positions = new Float32Array(CONFIG.particleCount * 3);
        const colors = new Float32Array(CONFIG.particleCount * 3);
        const sizes = new Float32Array(CONFIG.particleCount);
        const originalPositions = new Float32Array(CONFIG.particleCount * 3);  // Store original positions
        
        // Generate particles in a sphere pattern
        for (let i = 0; i < CONFIG.particleCount; i++) {
            // Use spherical coordinates for uniform distribution
            const phi = Math.acos(-1 + (2 * i) / CONFIG.particleCount);
            const theta = Math.sqrt(CONFIG.particleCount * Math.PI) * phi;
            
            // Convert to Cartesian coordinates
            const x = CONFIG.sphereRadius * Math.sin(phi) * Math.cos(theta);
            const y = CONFIG.sphereRadius * Math.sin(phi) * Math.sin(theta);
            const z = CONFIG.sphereRadius * Math.cos(phi);
            
            // Set position
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            // Store original position for displacement calculations
            originalPositions[i * 3] = x;
            originalPositions[i * 3 + 1] = y;
            originalPositions[i * 3 + 2] = z;
            
            // Set color (cyan with slight variation)
            const colorVariation = 0.8 + Math.random() * 0.2;
            colors[i * 3] = 0.0 * colorVariation;      // R
            colors[i * 3 + 1] = 1.0 * colorVariation;    // G
            colors[i * 3 + 2] = 1.0 * colorVariation;   // B
            
            // Set size with slight variation for depth
            sizes[i] = CONFIG.particleSize * (0.5 + Math.random() * 0.5);
        }
        
        // Add attributes to geometry
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Create shader material with noise-based displacement
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: renderer.getPixelRatio() },
                uMousePosition: { value: new THREE.Vector3(0, 0, 0) },
                uDisturbanceRadius: { value: CONFIG.disturbanceRadius },
                uDisturbanceStrength: { value: CONFIG.disturbanceStrength },
                uDisturbanceFalloff: { value: CONFIG.disturbanceFalloff }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                attribute vec3 originalPosition;
                
                varying vec3 vColor;
                varying float vDisturbance;
                
                uniform float uTime;
                uniform float uPixelRatio;
                uniform vec3 uMousePosition;
                uniform float uDisturbanceRadius;
                uniform float uDisturbanceStrength;
                uniform float uDisturbanceFalloff;
                
                // Simplex noise function for organic displacement
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    
                    vec3 i  = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                    
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    
                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);
                    
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                    
                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);
                    
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;
                    
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }
                
                void main() {
                    vColor = color;
                    
                    // Calculate distance from mouse position (in world space)
                    float distFromMouse = length(originalPosition - uMousePosition);
                    
                    // Create disturbance field with smooth falloff
                    float disturbanceFactor = 1.0 - smoothstep(0.0, uDisturbanceRadius, distFromMouse);
                    disturbanceFactor = pow(disturbanceFactor, uDisturbanceFalloff);
                    
                    // Store disturbance amount for fragment shader (color effect)
                    vDisturbance = disturbanceFactor;
                    
                    // Generate noise-based displacement
                    float noiseScale = 2.0;
                    float timeScale = uTime * 0.5;
                    
                    // Multi-octave noise for organic ripples
                    vec3 noisePos = originalPosition * noiseScale + vec3(timeScale);
                    float noise = snoise(noisePos) * 0.5 + snoise(noisePos * 2.0) * 0.25;
                    
                    // Calculate displacement direction (outward from sphere center)
                    vec3 displacementDir = normalize(originalPosition);
                    
                    // Apply displacement based on disturbance field
                    float displacementAmount = disturbanceFactor * uDisturbanceStrength * (1.0 + noise * 0.5);
                    
                    // Add wave effect - ripples moving across sphere
                    float wavePhase = distFromMouse * 3.0 - uTime * 2.0;
                    float wave = sin(wavePhase) * 0.3 * disturbanceFactor;
                    displacementAmount += wave;
                    
                    // Apply final position
                    vec3 newPosition = originalPosition + displacementDir * displacementAmount;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
                    gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vDisturbance;
                
                // Convert RGB to HSL
                vec3 rgb2hsl(vec3 c) {
                    float maxC = max(max(c.r, c.g), c.b);
                    float minC = min(min(c.r, c.g), c.b);
                    float l = (maxC + minC) / 2.0;
                    float h = 0.0;
                    float s = 0.0;
                    
                    if (maxC != minC) {
                        float d = maxC - minC;
                        s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
                        
                        if (maxC == c.r) {
                            h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
                        } else if (maxC == c.g) {
                            h = (c.b - c.r) / d + 2.0;
                        } else {
                            h = (c.r - c.g) / d + 4.0;
                        }
                        h /= 6.0;
                    }
                    return vec3(h, s, l);
                }
                
                // Convert HSL to RGB
                float hue2rgb(float p, float q, float t) {
                    if (t < 0.0) t += 1.0;
                    if (t > 1.0) t -= 1.0;
                    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
                    if (t < 1.0/2.0) return q;
                    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
                    return p;
                }
                
                vec3 hsl2rgb(vec3 c) {
                    if (c.y == 0.0) {
                        return vec3(c.z);
                    }
                    float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
                    float p = 2.0 * c.z - q;
                    return vec3(
                        hue2rgb(p, q, c.x + 1.0/3.0),
                        hue2rgb(p, q, c.x),
                        hue2rgb(p, q, c.x - 1.0/3.0)
                    );
                }
                
                void main() {
                    // Create circular particle with soft glow
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    // Soft circular falloff
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                    
                    // Add glow effect
                    float glow = exp(-dist * 4.0) * 0.5;
                    
                    // Convert base color to HSL
                    vec3 hsl = rgb2hsl(vColor);
                    
                    // Shift hue based on disturbance (move toward orange/gold when disturbed)
                    float hueShift = vDisturbance * 0.2;
                    hsl.x = mod(hsl.x + hueShift, 1.0);
                    
                    // Increase saturation when disturbed
                    hsl.y = min(hsl.y + vDisturbance * 0.4, 1.0);
                    
                    // Increase lightness when disturbed (brighter)
                    hsl.z = min(hsl.z + vDisturbance * 0.3, 1.0);
                    
                    // Convert back to RGB
                    vec3 disturbedColor = hsl2rgb(hsl);
                    
                    // Add white-hot effect at center of disturbance
                    disturbedColor = mix(disturbedColor, vec3(1.0, 1.0, 1.0), vDisturbance * 0.6);

                    
                    // Combine color with glow
                    vec3 finalColor = disturbedColor + vec3(glow);
                    
                    gl_FragColor = vec4(finalColor, alpha + glow);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending, // Glow effect
            depthWrite: false
        });
        
        // Create particle system
        particles = new THREE.Points(geometry, material);
        scene.add(particles);
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================
    
    /**
     * Add all event listeners
     */
    function addEventListeners() {
        // Mouse move - track position
        document.addEventListener('mousemove', onMouseMove, false);
        
        // Window resize - handle responsive canvas
        window.addEventListener('resize', onWindowResize, false);
        
        // Touch events for mobile
        document.addEventListener('touchmove', onTouchMove, { passive: true });
    }

    /**
     * Handle mouse movement - calculate 3D position for disturbance
     */
    function onMouseMove(event) {
        // Normalize mouse position to -1 to 1 range
        mouseX = (event.clientX - windowHalfX) / windowHalfX;
        mouseY = (event.clientY - windowHalfY) / windowHalfY;
        
        // Calculate 3D mouse position by unprojecting to world space
        // This projects the 2D mouse onto the sphere's approximate depth
        const vector = new THREE.Vector3(
            mouseX * CONFIG.sphereRadius * 1.5,
            -mouseY * CONFIG.sphereRadius * 1.5,
            0
        );
        
        // Smoothly interpolate the 3D mouse position
        mouse3D.lerp(vector, 0.15);
    }

    /**
     * Handle touch movement (mobile)
     */
    function onTouchMove(event) {
        if (event.touches.length > 0) {
            mouseX = (event.touches[0].clientX - windowHalfX) / windowHalfX;
            mouseY = (event.touches[0].clientY - windowHalfY) / windowHalfY;
            
            // Update 3D position for touch as well
            const vector = new THREE.Vector3(
                mouseX * CONFIG.sphereRadius * 1.5,
                -mouseY * CONFIG.sphereRadius * 1.5,
                0
            );
            mouse3D.lerp(vector, 0.15);
        }
    }

    /**
     * Handle window resize
     */
    function onWindowResize() {
        // Update window half values
        windowHalfX = window.innerWidth / 2;
        windowHalfY = window.innerHeight / 2;
        
        // Update camera
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        
        // Update renderer
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Update particle sizes for new pixel ratio
        if (particles && particles.material.uniforms) {
            particles.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
        }
    }

    // ============================================
    // ANIMATION LOOP
    // ============================================
    
    /**
     * Main animation loop
     */
    function animate() {
        // Request next frame
        requestAnimationFrame(animate);
        
        // Update rotation based on mouse position
        updateRotation();
        
        // Update shader uniforms
        if (particles && particles.material.uniforms) {
            particles.material.uniforms.uTime.value += 0.016;
            
            // Smooth delay: interpolate delayed position toward current mouse position
            // Lower delay factor = faster response, Higher = more delay
            delayedMouse3D.lerp(mouse3D, CONFIG.mouseDelay);
            
            // Pass delayed mouse 3D position to shader for trail effect
            particles.material.uniforms.uMousePosition.value.copy(delayedMouse3D);
        }
        
        // Update vaporwave background animation
        if (scene.userData.background && scene.userData.background.material.uniforms) {
            scene.userData.background.material.uniforms.uTime.value += 0.016;
        }
        
        // Render the scene
        renderer.render(scene, camera);
    }

    /**
     * Update particle rotation based on mouse and automatic rotation
     */
    function updateRotation() {
        if (!particles) return;
        
        // Calculate target rotation from mouse
        targetRotationX = mouseY * CONFIG.mouseInfluence * Math.PI;
        targetRotationY = mouseX * CONFIG.mouseInfluence * Math.PI;
        
        // Smooth interpolation (lerp) for fluid movement
        particles.rotation.x += (targetRotationX - particles.rotation.x) * 0.05;
        particles.rotation.y += (targetRotationY - particles.rotation.y) * 0.05;
        
        // Add base automatic rotation
        particles.rotation.y += CONFIG.rotationSpeed;
    }

    // ============================================
    // START
    // ============================================
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();