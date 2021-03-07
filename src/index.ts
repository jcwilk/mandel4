//import _ from 'lodash';
import './index.css';
import REGL, { Framebuffer } from 'regl'
import { Resizer } from './resizer'
import { Controls } from './controls'

const regl = REGL({
    // TODO: why do these seem to do nothing?
    // extensions: ['OES_texture_float'],
    // optionalExtensions: ['oes_texture_float_linear'],
});

const RADIUS = 2048 // TODO - make this not just square
const MAX_ITERATIONS = 128
const INITIAL_CONDITIONS = (Array(RADIUS * RADIUS * 4)).fill(0)
const FIRST_ITERATIONS = 10;

let state: Array<REGL.Framebuffer2D>;

const resetState = () => {
    state = (Array(2)).fill(0).map(() =>
        regl.framebuffer({
            color: regl.texture({
                radius: RADIUS,
                data: INITIAL_CONDITIONS,
                wrap: 'repeat'
            }),
            // semingly no effect (yet?)
            // colorFormat: 'rgba32f',
            // colorType: 'float',
            depthStencil: false
        }))
}
resetState();

const updateFractal = regl({
    frag: `
    precision mediump float;

    varying vec2 uv;
    varying vec2 coords;
    uniform sampler2D prevState;

    void main()
    {
        vec4 data = texture2D(prevState, uv);
        float x = data.x+data.x;
        float y = data.y+data.y;
        int i = int(data.z*${MAX_ITERATIONS}.);
        float signs = data.a;
        vec2 c = coords;
        int iterTodo = 1;

        if (i == 0) {
            x = 0.;
            y = 0.;
            signs = 0.;
            iterTodo = int(min(${MAX_ITERATIONS}.,${FIRST_ITERATIONS}.));
        }

        if (signs > .5) {
            x = -x;
            signs-=.5;
        }
        if (signs > .25) {
            y = -y;
        }

        if (i >= ${MAX_ITERATIONS}) {
            i = ${MAX_ITERATIONS};
        } else {
            if (i == 0) {
                for(int j=0;j<${FIRST_ITERATIONS};j++) {
                    //COPY OF BELOW!
                    if (x*x + y*y < 4.) {
                        float zx = x*x - y*y + c.x;
                        y = (x+x)*y + c.y;
                        x = zx;
                        i++;
                    } else {
                        x = 2.;
                        y = 2.;
                    }
                }
            } else {
                //COPY OF ABOVE!
                if (x*x + y*y < 4.) {
                    float zx = x*x - y*y + c.x;
                    y = (x+x)*y + c.y;
                    x = zx;
                    i++;
                } else {
                    x = 2.;
                    y = 2.;
                }
            }
        } 
        signs = 0.;
        if (x < 0.) {
            signs+=.6;
            x=-x;
        }
        if (y < 0.) {
            signs+=.3;
            y=-y;
        }
        gl_FragColor = vec4(x/2.,y/2.,float(i)/${MAX_ITERATIONS}.,signs);
    }`,

    framebuffer: ({ tick }, props) => (props as any).dataBuffers[(tick + 1) % 2],
})

const setupQuad = regl({
    frag: `
  precision mediump float;
  uniform sampler2D prevState;
  varying vec2 uv;
  varying vec2 coords;
  void main() {
    float state = texture2D(prevState, uv).z;
    gl_FragColor = vec4(vec3(state), 1);
  }`,

    vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  varying vec2 coords;
  uniform float graphWidth;
  uniform float graphHeight;
  uniform float graphX;
  uniform float graphY;
  void main() {
    uv = (position + 1.) / 2.;
    coords = vec2(position.x * graphWidth / 2. + graphX, position.y * graphHeight / 2. + graphY);
    gl_Position = vec4(position, 0, 1);
  }`,

    attributes: {
        position: regl.buffer([
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1]
        ])
    },

    uniforms: {
        prevState: ({ tick }, props) => (props as any).dataBuffers[tick % 2],
        graphWidth: (context, props) => (props as any).graphWidth,
        graphHeight: (context, props) => (props as any).graphHeight,
        graphX: (context, props) => (props as any).graphX,
        graphY: (context, props) => (props as any).graphY
    },

    depth: { enable: false },

    count: 4,

    primitive: 'triangle strip'
})

document.addEventListener('DOMContentLoaded', function () {
    let screenSize = 2;
    let graphX = -0.5;
    let graphY = 0;

    const controls = new Controls(document);

    const resizer = new Resizer(window, 2);

    const onResize = () => {
        resetState();
        if (resizer.isPortrait()) {
            controls.layout = 'portrait';
        } else {
            controls.layout = 'landscape';
        }
    }
    onResize();
    resizer.onResize = onResize;

    regl.frame(() => {
        if (controls.isDown('plus')) {
            screenSize *= .95;
            resizer.screenSize = screenSize;
            resetState();
        }
        if (controls.isDown('minus')) {
            screenSize /= .95;
            resizer.screenSize = screenSize;
            resetState();
        }
        if (controls.isDown('up')) {
            graphY += .01 * screenSize;
            resetState();
        }
        if (controls.isDown('down')) {
            graphY -= .01 * screenSize;
            resetState();
        }
        if (controls.isDown('left')) {
            graphX -= .01 * screenSize;
            resetState();
        }
        if (controls.isDown('right')) {
            graphX += .01 * screenSize;
            resetState();
        }

        setupQuad({
            graphWidth: resizer.graphWidth,
            graphHeight: resizer.graphHeight,
            graphX: graphX,
            graphY: graphY,
            dataBuffers: state
        }, () => {
            regl.draw()
            updateFractal({ dataBuffers: state }) // wonder why this isn't sharing the same props...
        })
    })
}, false);

