// Hand-built, editable vector master. No bitmap tracing or embedded images.
const gradients=[]
const stops=values=>values.map(([offset,color,opacity=1])=>`<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join('')
function linear(id,x1,y1,x2,y2,values){
  gradients.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(values)}</linearGradient>`)
  return `url(#${id})`
}
function radial(id,cx,cy,r,values){
  gradients.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops(values)}</radialGradient>`)
  return `url(#${id})`
}
const p=(id,d,fill,extra='')=>`<path id="${id}" d="${d}" fill="${fill}" ${extra}/>`
const line=(id,d,color,width,opacity=1)=>p(id,d,'none',`stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"`)
const ellipse=(id,cx,cy,rx,ry,fill,extra='')=>`<ellipse id="${id}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`
const group=(id,contents)=>`<g id="${id}">${contents.join('\n')}</g>`
function soft(id,cx,cy,rx,ry,color,alpha){
  const fill=radial(`${id}_paint`,0,0,1,[[0,color,alpha],[.5,color,alpha*.55],[1,color,0]])
  return `<g id="${id}" transform="translate(${cx} ${cy}) scale(${rx} ${ry})"><circle cx="0" cy="0" r="1" fill="${fill}"/></g>`
}

export function draw(){
  gradients.length=0
  const skin=radial('skin',226,190,213,[[0,'#ffd69e'],[.42,'#ffcb8d'],[.76,'#e8a668'],[1,'#b97643']])
  const neckPaint=linear('neck_paint',257,356,257,438,[[0,'#a96838'],[.31,'#df9b5a'],[.75,'#fac180'],[1,'#edb071']])
  const earPaint=linear('ear_paint',128,210,157,271,[[0,'#c9884f'],[.3,'#f0b276'],[.67,'#ffcb8b'],[1,'#cf8b50']])
  const hair=linear('hair_mass',181,30,304,305,[[0,'#e7b872'],[.17,'#c69757'],[.48,'#9b6a36'],[.8,'#76502d'],[1,'#b68345']])
  const lock=linear('hair_lock',215,39,259,94,[[0,'#a9783d'],[.23,'#e5b775'],[.44,'#f6d49b'],[.63,'#b98749'],[1,'#79532e']])
  const lockR=linear('hair_lock_r',310,39,309,151,[[0,'#edc98c'],[.17,'#d8a96a'],[.48,'#b27d40'],[.7,'#dfb57a'],[1,'#8f6131']])
  const strand=linear('strand_shine',170,50,220,120,[[0,'#f9dcab',0],[.45,'#ffe7bd',.8],[1,'#d3a367',0]])
  const shirtPaint=radial('shirt_paint',213,431,239,[[0,'#55555e'],[.52,'#41414a'],[.85,'#2e2f37'],[1,'#24262e']])
  const collarPaint=linear('collar_paint',254,411,254,460,[[0,'#30313a'],[.3,'#41424b'],[.7,'#4c4d55'],[1,'#30313a']])
  const irisPaint=radial('iris_paint',0,0,13,[[0,'#302015'],[.5,'#5b3a17'],[.82,'#795024'],[1,'#332719']])
  const eyeWhite=linear('eye_white',0,204,0,233,[[0,'#aea8a5'],[.35,'#f5f3ef'],[.75,'#fffdf8'],[1,'#d2c7b9']])
  const browPaint=linear('brow_paint',0,183,0,208,[[0,'#81542d'],[.5,'#9b6d3c'],[1,'#ba8b52',.7]])
  const lipUpper=linear('upper_lip_paint',0,316,0,331,[[0,'#c96d62'],[.5,'#b85452'],[1,'#7e3030']])
  const lipLower=linear('lower_lip_paint',0,329,0,345,[[0,'#ce6c68'],[.35,'#e78a7f'],[.7,'#d16b65'],[1,'#a74b45']])
  const nosePaint=radial('nose_paint',248,263,31,[[0,'#ffd49d'],[.45,'#f4b37b'],[.8,'#d9945c'],[1,'#bf7c48',0]])

  const hairBack=group('hair_back',[
    p('hair_silhouette','M130 206 C113 191 108 166 117 142 C127 111 141 84 161 63 C185 33 224 22 252 42 C275 21 312 28 340 47 C375 69 395 104 405 134 C411 161 409 187 397 212 C398 225 393 244 381 257 C375 269 370 284 366 299 L370 342 C376 355 369 372 354 379 C332 389 322 370 322 356 L156 296 C132 282 126 263 130 247 C117 234 119 217 130 206 Z',hair),
    p('ponytail','M354 299 C374 299 394 313 398 335 C403 354 391 368 379 374 C367 382 348 375 341 359 C330 341 335 314 354 299 Z',lockR),
    p('tail_lock_1','M353 307 C375 310 391 337 376 365 C389 352 389 332 379 319 C370 308 360 305 353 307 Z','#d3a56b'),
    p('tail_lock_2','M351 322 C363 329 373 350 359 370 C379 356 371 334 351 322 Z','#906333'),
    line('tail_strand','M365 308 C390 322 398 347 381 362','#f3cc8c',2,.65),
    line('tail_strand_2','M348 315 C353 340 378 347 364 372','#ad7e44',3,.8),
    line('flyaway_L1','M147 171 C108 189 95 220 109 244 C117 256 109 266 103 272','#bb8a4d',2.7),
    line('flyaway_L2','M136 212 C114 231 129 263 115 281 C108 291 116 310 123 314','#b8874e',2.3),
    line('flyaway_L3','M142 284 C124 292 118 307 128 321','#c39153',2),
    line('flyaway_R1','M397 186 C422 202 431 228 420 247 C414 259 399 265 396 273','#b9874a',2.5),
    line('flyaway_R2','M391 152 C419 166 432 193 414 210','#d1a263',1.8),
    line('flyaway_top_1','M250 43 C231 6 211 8 200 26','#c79655',2.8),
    line('flyaway_top_2','M252 42 C263 7 281 9 292 25','#ddb274',2.2),
    line('flyaway_top_3','M245 35 C228 8 207 10 193 26','#efd09c',1.2)
  ])

  const shirt=group('shirt',[
    p('shirt_silhouette','M185 378 C157 380 137 394 114 405 C73 420 48 447 38 478 C35 490 65 490 95 492 C177 495 320 495 417 491 C448 490 480 489 481 479 C475 446 450 421 414 407 C393 399 364 383 344 379 Z',shirtPaint),
    p('sleeve_L_shadow','M94 421 C75 441 71 461 78 491 L95 492 C85 462 87 440 104 420 Z','#22242d','opacity=".45"'),
    p('sleeve_R_shadow','M435 421 C456 444 459 468 450 490 L425 491 C443 470 443 447 430 424 Z','#22242d','opacity=".42"'),
    line('shoulder_L_seam','M94 422 C80 441 79 467 89 488','#696770',1.1,.25),
    line('shoulder_R_seam','M433 421 C450 445 453 471 442 489','#74717a',1,.2)
  ])

  const neck=group('neck',[
    p('neck_base','M196 350 C202 373 201 397 190 407 C188 428 220 444 259 447 C294 447 336 428 345 410 C333 401 329 375 331 349 Z',neckPaint),
    soft('chin_cast_shadow',264,382,72,32,'#8d542e',.47),
    soft('neck_front_light',250,421,57,24,'#ffe0ac',.37),
    p('collar','M186 397 C196 423 222 437 259 438 C297 438 328 425 344 398 L358 404 C348 440 310 458 260 458 C213 456 179 440 172 409 Z',collarPaint),
    line('collar_edge','M179 406 C188 435 221 451 260 451 C300 453 340 434 352 406','#69666e',1.5,.6),
    line('collar_inside','M190 402 C202 425 225 437 259 438 C296 439 328 425 342 403','#262830',2.7,.8)
  ])

  const earL=group('ear_L',[
    p('ear_L_base','M146 207 C134 195 126 207 129 228 C130 252 138 270 151 277 C159 281 167 267 162 252 Z',earPaint),
    p('ear_L_fold','M145 215 C133 208 135 225 141 237 C145 243 148 249 145 258 C152 257 155 248 149 238 C140 226 138 217 145 215 Z','#bf7d49'),
    line('ear_L_inner_light','M136 212 C133 225 143 242 145 245','#ffd7a0',3,.7),
    soft('ear_L_shadow',152,246,12,23,'#995d35',.3)
  ])
  const earR=group('ear_R',[
    p('ear_R_base','M369 211 C380 191 393 202 389 229 C387 254 380 270 366 278 C357 280 354 263 360 249 Z',earPaint),
    p('ear_R_fold','M376 213 C387 206 384 226 379 237 C372 246 369 250 374 257 C365 258 363 245 370 237 C378 225 382 215 376 213 Z','#ba7847'),
    line('ear_R_inner_light','M385 211 C389 225 378 241 375 245','#ffd39a',3,.7),
    soft('ear_R_shadow',364,248,13,24,'#995d35',.32)
  ])

  const face=group('face',[
    p('face_base','M156 134 C168 108 205 86 249 85 C297 79 343 107 361 142 C372 165 371 195 373 217 C377 236 373 267 366 289 C360 313 348 338 333 354 C313 374 291 391 269 395 C247 398 224 388 208 372 C187 354 168 330 158 307 C146 282 141 250 141 224 C140 195 143 161 156 134 Z',skin),
    soft('forehead_light',231,144,83,59,'#ffe2b3',.52),
    soft('temple_L_shade',154,203,12,64,'#a96935',.28),
    soft('temple_R_shade',365,208,12,65,'#a16c39',.25),
    soft('cheek_L_light',180,270,33,53,'#ffdfac',.5),
    soft('cheek_R_light',329,266,35,52,'#ffdcaa',.3),
    soft('cheek_L_warmth',180,283,33,23,'#db8863',.15),
    soft('cheek_R_warmth',332,281,29,25,'#da8460',.17),
    soft('jaw_L_shade',199,330,15,25,'#ab703f',.18),
    soft('jaw_R_shade',323,330,14,25,'#a86b3b',.18),
    soft('chin_light',260,366,45,24,'#ffe0a9',.45),
    soft('under_lip_shadow',258,350,35,10,'#92532f',.23)
  ])

  const eyeL=group('eye_L',[
    soft('eye_L_socket',196,219,39,23,'#ac6d38',.56),
    p('eye_L_lower_lid','M163 222 C179 233 209 234 227 223 C227 232 211 238 194 238 C179 236 168 231 163 222 Z','#d39358'),
    p('eye_L_white','M164 222 C173 209 187 205 200 208 C213 209 223 216 227 224 C209 234 180 234 164 224 Z',eyeWhite),
    `<g id="eye_L_iris" transform="translate(199 219)">${ellipse('iris_L',0,0,12.5,12.5,irisPaint)}${ellipse('pupil_L',0,-.6,7.3,8.1,'#1d1714')}${ellipse('catchlight_L',-3.5,-5,3,2.5,'#ffffff')}${ellipse('catchlight_L_small',4,4,1,1,'#ba9d6f')}</g>`,
    line('eye_L_upper_lid','M164 222 C173 207 191 203 206 209 C216 212 223 218 227 224','#80542f',2.5),
    line('eye_L_lid_fold','M163 214 C176 198 204 199 220 211','#c38a50',1.8,.55),
    line('eye_L_lower_light','M174 232 C189 239 211 236 221 230','#ffdda1',2,.65),
    p('eye_L_tear','M164 222 L168 220 L168 226 Z','#c27d63')
  ])
  const eyeR=group('eye_R',[
    soft('eye_R_socket',304,216,40,24,'#aa6833',.53),
    p('eye_R_lower_lid','M275 223 C291 232 318 230 334 220 C331 234 313 238 299 237 C286 235 278 230 275 223 Z','#d49457'),
    p('eye_R_white','M275 223 C282 210 295 204 309 205 C321 206 330 212 335 220 C319 231 294 233 275 225 Z',eyeWhite),
    `<g id="eye_R_iris" transform="translate(303 217)">${ellipse('iris_R',0,0,12.7,12.7,irisPaint)}${ellipse('pupil_R',0,-.5,7.5,8.1,'#1d1714')}${ellipse('catchlight_R',-3.6,-5,3,2.5,'#ffffff')}${ellipse('catchlight_R_small',4,4,1,1,'#ba9d6f')}</g>`,
    line('eye_R_upper_lid','M275 223 C282 208 295 202 310 204 C321 205 330 212 335 220','#80522d',2.5),
    line('eye_R_lid_fold','M278 211 C294 196 319 197 334 211','#bd8249',1.8,.52),
    line('eye_R_lower_light','M282 231 C297 237 320 233 329 226','#ffdda1',2,.6),
    p('eye_R_tear','M275 224 L279 220 L279 227 Z','#c27d63')
  ])

  const brows=group('brows',[
    group('brow_L',[
      p('brow_L_mass','M157 202 C169 189 187 185 202 189 C215 192 223 198 230 207 C212 202 202 201 188 201 C176 201 166 204 157 202 Z',browPaint),
      ...Array.from({length:15},(_,i)=>{const x=162+i*4.2,y=199-7*Math.sin(i/14*Math.PI);return line(`brow_L_hair_${i}`,`M${x} ${y+3} Q${x+2} ${y-2} ${x+6} ${y-3}`,'#754c29',.75,.4)})
    ]),
    group('brow_R',[
      p('brow_R_mass','M263 205 C271 193 284 185 298 184 C314 183 331 187 344 195 C329 192 315 194 301 197 C287 199 277 202 263 205 Z',browPaint),
      ...Array.from({length:17},(_,i)=>{const x=269+i*4.1,y=198-9*Math.sin(i/16*Math.PI);return line(`brow_R_hair_${i}`,`M${x} ${y+3} Q${x+1} ${y-2} ${x+5} ${y-4}`,'#754c29',.75,.4)})
    ])
  ])

  const nose=group('nose',[
    soft('nose_L_shadow',238,255,14,39,'#b67942',.32),
    soft('nose_R_shadow',269,256,13,39,'#ae713f',.25),
    soft('nose_bridge_light',250,242,13,37,'#ffe3b4',.5),
    p('nose_tip','M241 253 C241 264 231 267 231 276 C229 285 239 291 247 291 C251 299 263 300 268 291 C280 289 284 283 281 276 C278 269 269 264 268 254 Z',nosePaint),
    soft('nose_tip_light',253,276,15,10,'#ffe1b3',.6),
    p('nostril_L','M237 285 C240 282 245 283 247 289 C241 287 240 286 237 287 Z','#8e4d2e'),
    p('nostril_R','M266 289 C268 283 274 281 277 285 C274 285 270 287 266 289 Z','#8e4d2e'),
    soft('nose_under_shadow',257,294,17,7,'#a35b34',.35),
    soft('philtrum',256,309,10,13,'#b77646',.23)
  ])

  const mouth=group('mouth',[
    soft('mouth_surround',259,331,55,17,'#d88b61',.18),
    p('upper_lip','M208 323 C220 324 232 319 244 317 C250 316 253 320 258 321 C263 319 268 316 274 318 C287 320 294 322 303 322 C289 329 273 333 258 332 C242 332 225 329 208 323 Z',lipUpper),
    p('lower_lip','M208 323 C224 329 240 331 258 330 C275 331 289 327 303 322 C296 336 279 345 261 345 C241 345 222 336 208 323 Z',lipLower),
    line('lip_seam','M209 323 C226 328 242 330 258 330 C274 330 289 326 302 323','#74352b',1.2,.9),
    line('lip_soft_light','M238 337 C251 341 267 341 278 336','#ffbeb0',1.6,.45),
    soft('mouth_corner_L',208,323,5,6,'#84502f',.65),
    soft('mouth_corner_R',303,323,5,6,'#84502f',.65)
  ])
  const mole=group('mole',[
    ellipse('mole_shadow',327,286,2.5,3.1,'#a3623b','opacity=".35"'),
    ellipse('mole_base',327,285,2.05,2.45,'#8b4e2d'),
    ellipse('mole_light',326.5,284.3,.8,.65,'#b47c4c')
  ])

  const hairFront=group('hair_front',[
    p('hair_L_mass','M252 87 C236 64 210 60 183 73 C163 83 147 101 139 126 C131 153 131 183 133 207 C147 204 152 188 153 172 C154 153 162 131 175 116 C196 97 224 88 252 87 Z',hair),
    p('hair_R_mass','M252 87 C276 62 301 66 326 81 C348 94 365 119 369 146 C374 167 366 185 371 199 C375 210 384 215 388 208 C400 188 398 162 384 145 C367 129 358 105 341 85 C318 58 284 45 252 87 Z',hair),
    p('hair_L_lock_1','M114 176 C120 139 140 100 170 76 C200 52 231 56 252 86 C230 67 200 66 178 82 C150 101 132 137 114 176 Z',lock),
    p('hair_L_lock_2','M109 146 C128 108 145 80 174 61 C203 42 237 46 254 79 C231 53 201 53 178 69 C147 89 132 121 109 146 Z',lock),
    p('hair_L_lock_3','M123 111 C145 79 160 58 188 45 C217 30 244 44 253 70 C236 45 209 43 188 55 C160 69 145 92 123 111 Z',lock),
    p('hair_L_lock_4','M150 71 C177 43 192 33 211 34 C231 33 246 46 252 63 C239 46 219 40 202 46 C184 50 168 60 150 71 Z',lock),
    p('hair_R_lock_1','M253 86 C275 62 295 65 315 74 C341 87 358 113 382 133 C404 152 412 175 403 194 C406 171 389 152 372 139 C348 120 334 98 310 86 C287 76 269 79 253 86 Z',lockR),
    p('hair_R_lock_2','M252 80 C265 52 290 48 315 59 C341 69 359 89 378 109 C389 122 404 129 408 143 C393 132 378 124 363 110 C345 92 330 76 309 68 C288 59 268 63 252 80 Z',lockR),
    p('hair_R_lock_3','M253 71 C265 44 288 38 311 47 C336 56 353 72 371 85 C348 72 327 58 307 56 C283 49 267 58 253 71 Z',lockR),
    p('hair_R_lock_4','M252 65 C261 38 282 29 306 34 C326 38 343 50 358 60 C335 47 315 41 296 42 C276 43 262 52 252 65 Z',lock),
    p('hair_R_ear_lock','M378 158 C393 175 387 199 374 211 C374 207 371 203 371 198 C376 185 380 171 378 158 Z','#8c602f'),
    ...[
      ['M119 156 C141 108 184 53 232 71',2.4],
      ['M128 126 C156 87 191 49 234 60',1.8],
      ['M146 91 C176 58 213 34 243 59',1.8],
      ['M175 61 C207 35 233 42 249 64',1.2],
      ['M140 168 C145 123 185 84 226 80',2],
      ['M132 191 C136 174 139 156 147 141',1.4],
    ].map(([d,w],i)=>line(`hair_L_glint_${i}`,d,strand,w)),
    ...[
      ['M258 75 C285 46 321 63 347 85 C365 102 380 120 397 127',2],
      ['M259 61 C277 36 310 41 336 57',1.6],
      ['M266 84 C293 68 320 85 341 107 C362 128 389 142 398 163',2],
      ['M359 135 C377 151 384 170 380 185',1.7],
      ['M265 54 C285 31 310 36 331 46',1.2]
    ].map(([d,w],i)=>line(`hair_R_glint_${i}`,d,'#f6d49b',w,.52)),
    line('part_L','M251 86 C247 67 236 51 221 46','#7a542f',1.5,.7),
    line('part_R','M253 84 C254 65 266 51 278 45','#845a30',1.4,.65),
    line('temple_L_edge','M152 172 C151 187 148 198 143 202','#e7bd7e',2,.55),
    line('temple_R_edge','M373 177 C369 189 371 201 376 206','#e4b778',1.8,.6)
  ])
  const contents=[hairBack,shirt,neck,earL,earR,face,eyeL,eyeR,brows,nose,mouth,mole,hairFront]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Стас — векторная основа стикерпака"><defs>${gradients.join('\n')}</defs>${contents.join('\n')}</svg>\n`
}
